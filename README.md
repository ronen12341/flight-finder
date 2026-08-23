# מנוע חיפוש טיסות — פריסה ל-Vercel

מבנה הפרויקט:
```
flight-app/
├── index.html        ← האתר (הטופס + לוח המחירים)
├── api/
│   └── flights.js     ← השרת (קורא ל-Amadeus, מחזיר תאריכים זולים)
├── package.json
├── .gitignore
└── .env.example
```
האתר קורא ל-`/api/flights` באותו דומיין — לכן אין צורך ב-CORS ולא צריך לערוך כלום בקוד.

---

## שלב 1 — מפתח Amadeus (חינם, ~5 דק')
1. הירשם ב-https://developers.amadeus.com
2. My Self-Service Workspace → **Create New App**
3. העתק **API Key** ו-**API Secret**

## שלב 2 — Git
מהמחשב, בתיקיית הפרויקט:
```bash
git init
git add .
git commit -m "flight finder"
```
צור repo חדש ב-GitHub ודחוף אליו (GitHub יראה לך את שתי הפקודות המדויקות, בערך):
```bash
git remote add origin https://github.com/<user>/flight-app.git
git push -u origin main
```

## שלב 3 — Vercel
1. היכנס ל-https://vercel.com והתחבר עם GitHub.
2. **Add New → Project** → בחר את ה-repo → **Import**.
3. אל תשנה הגדרות build (זה פרויקט סטטי + פונקציה, Vercel מזהה לבד). לחץ **Deploy**.
4. אחרי הפריסה: **Settings → Environment Variables**, הוסף:
   - `AMADEUS_KEY` = ה-API Key
   - `AMADEUS_SECRET` = ה-API Secret
5. **Deployments → … → Redeploy** כדי שהמשתנים ייכנסו לתוקף.

זהו — יש לך אתר חי בכתובת `https://flight-app-xxx.vercel.app`.
מכאן, כל `git push` מעדכן את האתר אוטומטית.

---

## פיתוח מקומי (לא חובה)
```bash
npm i -g vercel
cp .env.example .env.local   # מלא את המפתחות
vercel dev                   # מריץ אתר + פונקציה על localhost:3000
```

## חשוב על הנתונים
- ברירת המחדל היא **סביבת הבדיקה** של Amadeus — נתונים מוגבלים/מטמון, שלרוב
  לא מכסים מסלולים מישראל. השרת מנסה קודם "Cheapest Date Search" ואם ריק —
  עובר ל-"Flight Offers Search" (כיסוי רחב יותר, מחזיר מחיר בשקלים).
- למחירים אמיתיים מלאים: ב-Amadeus עבור ל-**Production** (חינם עד מכסה חודשית),
  והוסף ב-Vercel את המשתנה `AMADEUS_BASE = https://api.amadeus.com`.
- המחיר הוא להשוואה בלבד; ההזמנה נעשית בקישור שנפתח (Google/Skyscanner/חברת התעופה).
