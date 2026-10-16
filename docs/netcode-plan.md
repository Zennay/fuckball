# Netcode v3 en peer-hosting

Doel: spelers uit Zuid-Amerika, Azië en Europa spelen samen, en 200 ms ping voelt als "iets minder scherp", niet als "onspeelbaar". De physics-engine en de parameters zijn nergens veranderd; wie host is altijd autoritatief.

## 1. Wat er nu is

| Laag | Wat het doet | Waar |
| --- | --- | --- |
| Inputs per frame | De client stempelt elke input met het hostframe waarvoor hij bedoeld is; de host past hem op precies dat frame toe. Te late inputs worden op volgorde ingehaald, één wijziging per frame, en een kick-tik wordt nooit opgeslokt. | `dist/netcode.js` (timeline), `dist/render-timing.js` (stempelen) |
| Voorsprong-regeling | Elke snapshot meldt hoeveel marge ("slack") de inputs van die client hadden. De client zet zijn klok onmerkbaar bij (max. 5% sneller / 2% trager) tot de 5e percentiel net boven nul ligt. | `createLeadController` |
| Zachte correcties | Een correctie wordt een visuele offset die in 40–80 ms wegzakt; boven 90 eenheden (aftrap, goal) springt het beeld wél. Alleen de getekende kopie wordt aangepast. | `createSmoother` |
| Peer-hosting | De kamer kan in de browser van een speler draaien als dat voor iedereen beter is, en wisselt naadloos mee met de verbindingen. | `dist/peer-net.js`, `dist/peer-host.js`, `dist/host-worker.js`, `headless/server.cjs` |
| Gedeelde kamerlogica | Dezelfde kamercode (teams, bots, start/stop, inputs, snapshots) draait op de Node-server en in een browser-worker, inclusief export/import van de complete toestand. | `dist/room-core.js`, `dist/headless-room.js` |
| Exacte engineklok | `step(1)` is nu altijd precies één engine-tick. Voorheen gaf de opgetelde klok ~1 op 3.300 stappen 0 of 2 ticks. | `dist/headless-room.js`, `headless/runtime.cjs` |

## 2. Metingen

`node scripts/netsim.cjs` draait echte engines (host + twee clients) over een gesimuleerd netwerk. Gemiddelde over 5 seeds × 30 s, client A op het profiel, client B op 20 ms. Afstanden zijn in stadioneenheden (spelerstraal 15, balstraal 5,8). "Schok" is het 99e percentiel van de tweede afgeleide van de getekende positie per frame: hoe hard iets zichtbaar verspringt.

**EU ↔ Zuid-Amerika** (200 ms, ±15 ms jitter, 0,5% verlies)

| | kick-tikken kwijt | eigen correctie p95 | eigen speler schok | bal schok | tegenstander schok |
| --- | --- | --- | --- | --- | --- |
| klassiek (TCP) | **25%** | 0,85 | 2,59 | 7,64 | 21,7 |
| v3 via server (TCP) | 0% | 0,31 | 0,97 | 3,23 | 5,30 |
| v3 via peer-host (UDP) | 0% | 0,10 | 1,03 | 5,30 | 5,12 |

**EU ↔ Azië op slechte wifi** (250 ms, ±35 ms, 2% verlies)

| | kick-tikken kwijt | eigen correctie p95 | eigen speler schok | bal schok | tegenstander schok |
| --- | --- | --- | --- | --- | --- |
| klassiek (TCP) | **37,5%** | 2,92 | 8,23 | 38,4 | 38,4 |
| v3 via server (TCP) | 0% | 2,51 | 2,69 | 6,94 | 13,1 |
| v3 via peer-host (UDP) | 0% | 0,00 | 0,90 | 6,02 | 7,39 |

De kick-test is het zwaarste geval: tikken van precies één frame. Echte tikken duren meestal langer, maar ook die vielen weg zodra pakketten na een hapering tegelijk binnenkwamen.

Bij TCP (WebSocket naar de server) blijft pakketverlies voelbaar: een verloren pakket houdt alles erachter vast. v3 haalt die inputs daarna netjes in, maar de hapering zelf blijft. Over de WebRTC-kanalen van peer-hosting bestaat dat probleem niet.

## 3. Peer-hosting: hoe het werkt

Wat je in je hoofd had: de kamer draait niet per se op een server maar bij de spelers zelf, en pakt steeds de beste verbinding. Dat kan, en het is gebouwd als **hybride**. De server blijft regisseur en vangnet; de simulatie mag naar een browser verhuizen.

1. **Meten.** Iedere speler heeft een WebRTC-datakanaal naar iedere andere speler (opgezet via de server). Elke seconde worden pings gemeten; elke 2 s gaat een rapport naar de server: ping naar de server, ping naar elke speler, en of deze browser mag hosten (tab zichtbaar, instelling aan, kanalen naar iedereen open).
2. **Kiezen.** De server berekent per kandidaat (de server zelf en elke geschikte speler) wat de spelers zouden merken:
   - de slechtste vertraging tussen twee spelers via die host: (ping(a,host) + ping(host,b)) / 2;
   - plus de helft van de slechtste voorspellingshorizon: max ping(speler,host) / 2.

   Een wissel gebeurt alleen bij minstens 25 ms en 15% winst, 8 s lang volgehouden, met 10 s rust na elke wissel.
3. **Overdragen op frame M.** De server kondigt "host wordt X vanaf frame M" aan, ruim genoeg vooruit dat iedereen het weet. De oude host rekent tot M en geeft de exacte toestand door: engine, alle input-tijdlijnen, kamerinstellingen, het bot-geheugen en de tellers. De nieuwe host rekent vanaf M verder op dezelfde kamerklok. Clients schakelen pas om bij de eerste snapshot van de nieuwe host met frame ≥ M. Daarna bevestigt een test dat de voortzetting **bit voor bit** gelijk is (1v1, 2v2 en 4v4, 60 s, bots inbegrepen).
4. **Vangnet.** Een host stuurt ~6× per seconde een reservekopie naar de server, en elke input gaat óók naar de server. Valt de host weg (tab dicht, netwerk weg, geen kopie binnen 1,5 s), dan rekent de server vanaf de laatste kopie verder met de inputs die hij zelf heeft. Een host die zo uitvalt, wordt een minuut niet gekozen. Bij een verborgen tabblad geeft de host de kamer meteen zelf terug.
5. **Joinen.** Een nieuwe speler laat de kamer eerst (naadloos) terugkomen naar de server, joint daar, en daarna kan de kamer weer verhuizen.

Een browser-host draait de kamer in een **Web Worker**. Dat moet: twee engines in dezelfde pagina delen interne timers. Bijkomend voordeel: de simulatie loopt los van het tekenen.

### Wanneer wint peer-hosting?

- **Iedereen in één regio, server ver weg** (bijv. 4 Europeanen, server in de VS): een speler host, en iedereen speelt op ~20 ms in plaats van ~100 ms. Hier wint peer-hosting het duidelijkst.
- **1v1 tussen twee continenten**: via een van de spelers is de vertraging tussen de twee precies de directe route. Een server ergens anders in Europa is een omweg. Een server precies in het midden is even goed voor de vertraging tussen spelers, maar eerlijker voor de voorspellingshorizon. De kostfunctie weegt dat af.
- **Gemengde groep, verspreid over de wereld**: vaak blijft de server de beste keuze. Dat beslist de meting, niet een vaste regel.

## 4. Eerlijke kanttekeningen

- **IP-adressen.** WebRTC laat spelers in dezelfde kamer elkaars IP-adres zien, net als bij HaxBall. Wie dat niet wil, zet *Peer hosting* uit in de instellingen; dan maakt die browser geen directe verbindingen.
- **Vertrouwen.** Een browser-host kan in principe valsspelen, net als een HaxBall-host. De server stuurt alleen een vaste lijst berichttypes door van een host. Ranked/competitief spelen hoort op een server.
- **Geen TURN-server.** Sommige NAT-combinaties krijgen geen direct kanaal. Die spelers blijven gewoon op de server spelen; peer-hosting valt dan niet in voor die kamer.
- **Browsers onderling.** Chrome en Node gebruiken dezelfde JavaScript-engine (V8), dus overdrachten daartussen zijn exact. Bij Firefox of Safari als host kunnen wiskundige functies minimaal anders afronden. Dat geeft hooguit een kleine, gladgestreken correctie, geen breuk.
- **Opnemen** blokkeert wisselen zolang de opname loopt (een opname kan niet mee verhuizen).
- **Kamers op de server** gaan nog over TCP (WebSocket). Zie stap 6.

## 5. Aan/uit en terugdraaien

- In het spel: Esc → Settings → **Netcode** (*v3* / *Classic*) en **Peer hosting** (aan/uit). Geldt vanaf de volgende verbinding.
- Server: `FUCKBALL_NETCODE=classic` (alles klassiek). Peer-hosting staat **standaard uit** vanwege de IP-adressen; `FUCKBALL_PEER_HOSTING=on` zet het aan.
- Git: de branch `netcode-plan` heeft aparte commits per stap (netcode v3, peer-hosting, documentatie). Elke stap is los terug te draaien met `git revert <commit>`.
- Oude en nieuwe clients kunnen in dezelfde kamer: snapshot-header `0x46423201` is klassiek, `0x46423203` is v3. Een klassieke client in de kamer houdt de kamer op de server.

## 6. Tests en volgende stappen

Tests:

- `tests/netcode.cjs`: timeline, voorsprong, smoothing, verkiezing, server-onderhandeling en een EU–ZA-simulatie.
- `tests/handover.cjs`: één tick per stap, en bit-exacte voortzetting na overdracht.
- `tests/peer-hosting.cjs`: echte server plus drie gesimuleerde browsers. Server→A→B, joinen tijdens peer-hosting, verborgen tab, failover, en een echte verkiezing op gemeten pings.
- `npm run test:browser`: echte Chromium, echte WebRTC en een echte worker-host, met overdrachten en failover. Draait ook in CI.

Volgende stappen, in volgorde van opbrengst:

1. **Onbetrouwbaar transport ook naar de server** (WebRTC-datakanaal of WebTransport aan de serverkant), zodat ook server-kamers geen TCP-haperingen meer hebben. Dat vraagt een native Node-dependency; dit project heeft er nu geen.
2. **Meerdere serverregio's** (bijv. Frankfurt, Virginia/Miami, São Paulo, Singapore). Dit is vooral hosting. De verkiezing werkt al met de server als kandidaat; met meerdere servers worden dat meerdere kandidaten.
3. **Een TURN-server**, zodat ook spelers achter strenge NAT direct kunnen verbinden.
4. Experimenten: tegenstanders voorspellen met de bot-AI in plaats van "laatste input vasthouden".
