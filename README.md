# Varuosad

Kuidas kasutada (lühike juhend)
	1.	Loo projektikataloog ja lisa LE.txt sinna.
	2.	Init ja install (terminalis):

npm init -y
npm install express csv-parser morgan chokidar

3.	Loo fail server.js ja kleebi sinna alljärgnev kood.
	4.	Käivita: node server.js
	5.	Testi näiteks: GET http://localhost:3000/parts?query=filternimi&limit=20&page=1&sort_by=price&sort_order=desc
või GET http://localhost:3000/parts/ABC12345 (seriaaliotsing)

Näited päringutest
	1.	Otsi nime järgi (substring, case-insensitive), leht 1, 20 kohta:

  GET /parts?query=ruuter&limit=20&page=1

  Vastus:

  {
  "total": 123,
  "page": 1,
  "per_page": 20,
  "total_pages": 7,
  "data": [ ... array of objects ... ]
}

2.	Otsi täpset seerianumbrit:

   GET /parts/ABC12345

3.	Sorteeri hinna järgi kahanevalt ja leht 2:

   GET /parts?query=mootor&limit=50&page=2&sort_by=price&sort_order=desc

4.	Käivita CSV uuesti laadimiseks (nt pärast automaatset hommikust eksporti):

   POST /reload

Olulised märkused ja soovitused
	•	Mälukasutus: 600 MB CSV võib laadituna võtta oluliselt rohkem mälu (objektid, stringid, JS overhead). Veendu, et serveril on piisavalt RAM (soovitus vähemalt ~4–8 GB sõltuvalt ridade arvust ja väljadest). Kui mälu piirangud on probleemiks, soovitan kasutada SQLite / PostgreSQL ja importida CSV andmebaasi ning teha päringud SQL-iga (salvestamine kettale + indekseerimine).
	•	Indeksid: Seni indekseerin ainult seerianumbri Map-iga. Kui soovid sagedasi keerukamaid otsinguid (nt täpsem tekstihäälestus, mitme välja otsing), mõtle tekstimootorile (Elasticsearch) või relatsioonilisele andmebaasile.
	•	CSV päised: Koodi eeldab CSV-l päisread. Kui päiseid pole, tuleb parseerimist kohandada (nt anda headers: [...]).
	•	Turvalisus: Kui API on avalik, lisa autentimine (API võtmed / JWT), rate-limit, ja CORS reeglid vastavalt vajadusele.
	•	Uuendused: Olen lisanud POST /reload ja võimaluse failivaatluseks (chokidar) — kasuta vastavalt, kuidas hommikune eksport asetatakse (sama failinimi/teekond).
	•	CSV eraldaja: Näites kasutan koma , eraldajat; kui fail kasutab teist (nt ; või tab), korda csv-parser seadistust (separator).
  
