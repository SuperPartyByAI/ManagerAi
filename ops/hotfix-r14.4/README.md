# SuperParty R14.4 performance hotfix

Acest hotfix păstrează funcțiile buildului live și modifică numai comportamentul frontend observat în bundle-ul de producție:

- afișează prima pagină Inbox imediat ce răspunsul ei sosește, fără să aștepte sincronizarea completă;
- limitează randarea simultană la primele 150 de conversații filtrate, dar păstrează registrul complet în memorie pentru căutare;
- reduce reîncărcarea completă a aplicației de la 30 de secunde la 5 minute;
- reduce pollingul conversației deschise de la 10 la 20 de secunde.

Scriptul de deploy nu publică și nu descarcă bundle-ul aplicației. El refuză orice build care nu are hashul live auditat, creează backup, aplică local patru transformări deterministe, verifică hashul rezultat, publică un nume nou de chunk pentru a evita cache-ul vechi, repornește exclusiv `superparty-portal.service` și face rollback automat dacă verificarea live eșuează.
