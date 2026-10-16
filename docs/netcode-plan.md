# Netcode v3: spelen over continenten (ontwerp)

Doel: een speler in São Paulo of Tokio speelt met Europeanen, en 200 ms ping voelt als "iets minder scherp", niet als "onspeelbaar". Dit document beschrijft hoe het nu werkt, waarom dat bij hoge ping breekt, en een model dat het oplost.

## 1. Wat er nu gebeurt

| Onderdeel | Nu | Probleem bij 200 ms / jitter / verlies |
| --- | --- | --- |
| Server | Eén Node-server, 60 Hz, op één plek (VPS) | Iemand in Azië speelt altijd via een lange route naar die ene plek |
| Transport | WebSocket (TCP), alles geordend en betrouwbaar | Eén verloren pakket blokkeert álles tot de hertransmissie: freeze van 1 RTT+ (200–400 ms), daarna een inhaalsprong |
| Inputs | `{type:'input', value, seq}` alleen bij verandering; de server zet ze bij aankomst | De server negeert het frame waarop jij drukte. Jitter van ±20 ms betekent dat je eigen speler steeds 1–2 frames wordt gecorrigeerd. Komen druk + loslaten in hetzelfde tick binnen (gebeurt na TCP-ophoping), dan wint alleen de laatste: **een kick kan verdwijnen** |
| Snapshots | Volledige room-snapshot (~1 KB, replay-formaat), 30 Hz, naar iedereen | Groot en traag; de client vervangt zijn hele staat ermee |
| Client | HaxBall-extrapolatie: laatste snapshot + eigen onbevestigde inputs, anderen houden hun laatste input vast | Klopt de voorspelling niet, dan springt de bal of tegenstander direct naar de nieuwe plek. Geen correctie-smoothing |

De extrapolatie zelf (`dist/render-timing.js`) is goed en blijft het fundament. Het probleem zit in transport, timing van inputs en hoe correcties zichtbaar worden.

Een harde ondergrens bestaat: de lichtsnelheid. Amsterdam–São Paulo is ~190 ms RTT, Amsterdam–Tokio ~230 ms, São Paulo–Tokio ~260 ms. Die latency kunnen we niet weghalen, alleen onzichtbaar maken. Wat wél weg kan: jitter, freezes door pakketverlies, verloren inputs en schokkerige correcties. Juist die maken HaxBall onspeelbaar, niet de 200 ms zelf.

## 2. Het model

Vijf lagen. Elke laag is apart te bouwen en te meten.

### Laag A: inputs per frame, redundant verstuurd

- De client stempelt elke input met het **serverframe** waarvoor hij bedoeld is (dat frame berekent `targetFrame()` nu al).
- Elk inputpakket bevat de inputs van de laatste ~12 frames (5 bits per frame, run-length gecodeerd: meestal een paar bytes). Een verloren pakket kost niets: het volgende pakket bevat dezelfde inputs nog eens.
- Verstuurd elke tick (60 Hz), niet alleen bij verandering. Ongeveer 20–30 bytes per pakket.
- Een kick die 1 frame lang was, bestaat dus als frame met kick-bit en kan niet meer wegvallen.

### Laag B: input-buffer op de server + tijdsdilatatie

- De server houdt per speler een kleine buffer: inputs voor toekomstige frames wachten tot hun frame komt. Elk frame krijgt precies de input die de speler voor dat frame bedoelde, ongeacht jitter.
- De client loopt voor op de server met `RTT/2 + buffer`. De buffer is adaptief: de server meldt per speler "je input kwam X frames te vroeg/te laat". De client past zijn klok heel licht aan (simulatiesnelheid ±2–3%, onzichtbaar) tot er net genoeg marge is, bijvoorbeeld het 95e percentiel van de jitter. Stabiele lijn: ~1 frame buffer. Wifi met pieken: 3–4 frames.
- Komt een input toch te laat, dan herhaalt de server de vorige input voor dat frame (zoals HaxBall/Rocket League) en de client corrigeert. Optioneel kan de server een paar frames terugspoelen en opnieuw simuleren (9 discs, dat is goedkoop), zodat een laat kickframe toch telt. Dit venster blijft klein (≤ 6 frames) zodat lag geen voordeel wordt.

Gevolg: **je eigen speler wordt bij stabiele ping nooit gecorrigeerd**. De client voorspelt precies wat de server gaat doen, omdat de server dezelfde inputs op dezelfde frames gebruikt met dezelfde engine.

### Laag C: kleine, frequente, deterministische snapshots

- Twee kanalen. **Betrouwbaar** voor joinen, stadion, teams, chat en score (het huidige 1 KB-formaat blijft hier). **Onbetrouwbaar** voor de match-staat.
- Match-snapshot per tick of om de tick: per disc positie + snelheid, plus framenummer en per speler de laatste verwerkte inputframe. Delta ten opzichte van de laatste snapshot die de client heeft bevestigd. Bij 4v4 + bal ongeveer 60–120 bytes.
- **Determinisme-truc** (Overwatch-aanpak): de server rondt zijn eigen staat elke tick af op precies de waarden die hij verstuurt (bijv. float32). Dan levert opnieuw simuleren op de client bit voor bit hetzelfde op als op de server, en ontstaan er geen kleine afwijkingen die later uitgroeien. Een test bewaakt dit.

### Laag D: client-voorspelling met zachte correcties

- De simulatie blijft zoals nu: laatste bevestigde snapshot → eigen inputs opnieuw toepassen → doorrekenen tot het doelframe.
- **Nieuw: de weergave springt niet meer.** Wijkt een nieuwe voorspelling af van de vorige, dan blijft het verschil bewaard als visuele offset die in ~80–150 ms naar nul zakt. De simulatie is direct correct, alleen het beeld glijdt.
  - Tegenstanders: altijd gladstrijken.
  - Bal: gladstrijken, behalve bij een groot verschil (> ~1 balstraal na een kick van iemand anders). Dan een snelle maar zichtbare overgang van ~50 ms in plaats van teleporteren.
  - Bij contact met je eigen speler weegt de offset minder zwaar, zodat de bal visueel niet "door je heen" gaat.
- **Andere spelers voorspellen**: standaard "houdt laatste input vast" (zoals nu en zoals Rocket League). Een experiment dat hier toevallig goed bij past: de getrainde bot-policy voorspelt wat een menselijke speler waarschijnlijk doet (naar de bal lopen, dekken). Alleen invoeren als metingen laten zien dat het correcties verkleint.

### Laag E: transport en servers dichtbij

1. **Onbetrouwbaar transport naar de server.** WebRTC DataChannel met `ordered:false, maxRetransmits:0` voor match-data (de browser heeft dit al voor de peer-modus; aan de serverkant `node-datachannel`). WebTransport-datagrammen later als tweede optie. De WebSocket blijft als fallback en voor betrouwbare berichten. Hiermee verdwijnen de TCP-freezes.
2. **Meerdere serverlocaties** (bijv. Frankfurt, Virginia/Miami, São Paulo, Singapore). Bij het maken van een room meet iedere client de ping naar alle regio's. De room draait op de regio waar de **hoogste ping het laagst** is. EU + Zuid-Amerika → Virginia/Miami (~110 + ~120 ms in plaats van 20 + 200). Dat is eerlijker: niemand heeft een groot thuisvoordeel.
3. **Relays (later, optioneel).** Een lichte UDP-relay per regio waar spelers verbinding mee maken. Die stuurt verkeer door over een goede backbone naar de room-server. Dit verlaagt niet altijd de ping, wel jitter en verlies op slechte routes (het idee achter Valve SDR / Riot Direct). Pas zinnig als metingen laten zien dat routes echt het probleem zijn.

## 3. Wat je dan voelt bij 200 ms

| Situatie | Nu | Met v3 |
| --- | --- | --- |
| Eigen beweging | Direct, met kleine schokjes door jitter | Direct, zonder correcties |
| Eigen kick op een vrije bal | Direct; kan bij pakketophoping verdwijnen | Direct en altijd geregistreerd |
| Pakketverlies 1–2% | Freeze van 200–400 ms + sprong | Onzichtbaar |
| Tegenstander verandert van richting | Springt | Glijdt in ~100 ms naar de juiste plek |
| Tegenstander schiet | Bal teleporteert | Bal buigt snel af naar de juiste baan |
| EU vs Azië | Eén kant speelt op 250+ ms | Room in het midden, beide ~120–150 ms |

Eerlijk over de grens: als jij en een tegenstander tegelijk tegen de bal duelleren, zie je zijn actie altijd ~zijn ping/2 + jouw ping/2 + buffer later. Dat is bij elk online spel zo, ook Rocket League. Dit model zorgt dat het in die situaties glad oogt en dat de rest van de tijd alles klopt.

## 4. Volgorde van bouwen

0. **Meten.** Een netwerksimulator in de tests (latency, jitter, verlies; profielen "EU–SA 200 ms ±20, 1%" en "slechte wifi") met meetwaarden: correcties van je eigen speler (px), sprongen van de bal (px), percentage kicks dat de server registreert, en freezes > 100 ms. Eerst meten we de huidige versie, daarna elke stap. "200 ping voelt goed" wordt zo een getal en geen gevoel.
1. **Laag A + B** over de bestaande WebSocket. Grootste winst, kleinste ingreep: verloren kicks en correcties door jitter verdwijnen.
2. **Laag D-smoothing + compacte snapshots (C).** Geen teleports meer en minder bandbreedte.
3. **Onbetrouwbaar transport (E1).** Weg met de TCP-freezes.
4. **Regio's + room-plaatsing (E2).** Dit is vooral hosting (meerdere VPS'en); de code-kant is ping-meting en een room-redirect.
5. Experimenten: input-voorspelling met de bot-policy, server-rollback voor late kicks, relays.

Na stap 1–3 zou 200 ms op één server al prima speelbaar moeten zijn. Stap 4 maakt het eerlijk tussen continenten.

Ontwerpregels die blijven gelden: de physics-engine en de parameters veranderen niet, de server blijft autoritatief, en extrapolatie/smoothing zitten alleen in de weergave of op kopieën van de staat.
