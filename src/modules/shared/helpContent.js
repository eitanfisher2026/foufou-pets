// Structured help content - icon + title + short plain-language body per
// card, grouped the same way SuperZola's help screen is: a sequential
// "getting started" walkthrough, and a separate, order-independent list of
// features someone would only look for once they already know the basics.
// Hardcoded rather than admin-editable free text (the old approach, one
// long paragraph stored in Firestore) - a structured walkthrough like this
// is something worth getting right in code and reviewing like any other
// content, not something that holds up well as a wall of text in a
// textarea. Exported as plain data, not JSX, so both HelpDialog.jsx (both
// tabs) and OnboardingDialog.jsx (just the getting-started list, for a new
// user's first look) render the exact same cards - one copy to keep
// current, not two that can drift apart.

export const GETTING_STARTED_CARDS = [
  {
    icon: '😿',
    title: '1. החיה שלכם אבדה?',
    body: 'לוחצים על הכפתור האדום "החיה שלי אבדה" בעמוד הבית וממלאים מה שידוע - צבע, סימנים מיוחדים, המקום והזמן שבו ראיתם אותה לאחרונה. ככל שיהיה יותר פירוט, כך קל יותר למצוא התאמה מדויקת.',
  },
  {
    icon: '🐾',
    title: '2. ראיתם או מצאתם חיה?',
    body: 'לוחצים על הכפתור הירוק "ראיתי/מצאתי". אין צורך להכיר את הבעלים - רק מדווחים על מה שראיתם, איפה ומתי. אם החיה אצלכם עכשיו, מציינים את זה בטופס.',
  },
  {
    icon: '📸',
    title: '3. יש צילום מסך של פוסט קיים?',
    body: 'אפשר להעלות צילום מסך מפייסבוק או וואטסאפ במקום למלא טופס ריק - המערכת קוראת אותו אוטומטית וממלאת את רוב השדות, ונשאר רק לבדוק ולאשר.',
  },
  {
    icon: '📲',
    title: '4. שיתוף ישיר מפייסבוק (Meta)',
    body: 'אחרי התקנת האפליקציה למסך הבית (מתפריט החשבון ⚙️ ← "התקנת האפליקציה"), אפשר ללחוץ "שיתוף" על פוסט בפייסבוק ולבחור "איתור חיות מחמד" מרשימת האפשרויות - בלי התקנה, האפליקציה פשוט לא תופיע שם.',
  },
  {
    icon: '✨',
    title: '5. לא בטוחים מה זה?',
    body: 'כפתור "הוספה חכמה" בעמוד הראשי מזהה הכל לבד - גם אם זה חתול או כלב, וגם אם זו אבידה או מציאה - מהתמונה או מהפוסט.',
  },
  {
    icon: '🔍',
    title: '6. בדיקת התאמות',
    body: 'בכל תיק חיפוש יש כפתור "בדיקת התאמות" שמשווה אותו מול כל הדיווחים הפעילים, ומציג התאמות אפשריות לפי רמת סבירות - כל התאמה עם הסבר פשוט למה היא נראית מתאימה.',
  },
  {
    icon: '📞',
    title: '7. יצירת קשר',
    body: 'כשנמצאת התאמה, פרטי הקשר (שם וטלפון) שכל צד מסר גלויים לצד השני - זו הדרך שבה בעל החיה האבודה ומי שמצא אותה יכולים לתאם ביניהם ישירות.',
  },
  {
    icon: '✅',
    title: '8. מצאתם את החיה?',
    body: 'עדכנו את הסטטוס בתיק כדי שלא ימשיכו לחפש אותה - זה גם מסמן למערכת שהחיפוש הסתיים.',
  },
];

export const ADDITIONAL_CARDS = [
  {
    icon: '🐈',
    title: 'חתולים וכלבים בנפרד',
    body: 'מתג חתול/כלב בראש עמוד הבית - לכל סוג חיה הרשימה, הטפסים והגזעים שמתאימים לו.',
  },
  {
    icon: '🗂️',
    title: 'ארכיון',
    body: 'תיקים ודיווחים שנסגרו או שלא היו פעילים זמן רב עוברים לארכיון - עדיין זמינים לצפייה, בלי לבלגן את הרשימה הפעילה.',
  },
  {
    icon: '🎯',
    title: 'רמת סבירות של התאמה',
    body: 'כל התאמה מסומנת ברמת סבירות (נמוכה/בינונית/גבוהה) לפי כמה פרטים תואמים - כולל השוואת תמונות אוטומטית כשהתמונות מספיק דומות כדי שכדאי לבדוק.',
  },
  {
    icon: '💬',
    title: 'משוב',
    body: 'תפריט החשבון (⚙️ למעלה) ← "שליחת משוב" - לדיווח על באג, רעיון, או כל שאלה. התשובות מגיעות לאותה שיחה.',
  },
  {
    icon: '🔒',
    title: 'פרטיות',
    body: 'תפריט החשבון ← "מדיניות פרטיות" - אילו נתונים נשמרים, לשם מה, ואיך אפשר לבקש שהם יימחקו.',
  },
];
