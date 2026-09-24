// Structured help content - icon + title + short plain-language body per
// card, grouped the same way SuperZola's help screen is: a sequential
// "getting started" walkthrough, and a separate, order-independent list of
// features someone would only look for once they already know the basics.
// Hardcoded rather than admin-editable free text (the old approach, one
// long paragraph stored in Firestore) - a structured walkthrough like this
// is something worth getting right in code and reviewing like any other
// content, not something that holds up well as a wall of text in a
// textarea. getGettingStartedCards() is a function, not plain data, because
// one step (Facebook sharing) depends on the viewer's own device - both
// HelpDialog.jsx and OnboardingDialog.jsx call it with the same
// usePwaInstall() flags so there's still one copy of the wording to keep
// current, not device-specific copies that can drift apart.

const STATIC_GETTING_STARTED_CARDS_TOP = [
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
    icon: '✨',
    title: '4. לא בטוחים מה זה?',
    body: 'כפתור "הוספה חכמה" בעמוד הראשי מזהה הכל לבד - גם אם זה חתול או כלב, וגם אם זו אבידה או מציאה - מהתמונה או מהפוסט.',
  },
];

const STATIC_GETTING_STARTED_CARDS_BOTTOM = [
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

// The Facebook-sharing step depends entirely on the device someone's
// actually reading this on, so - unlike the rest of the walkthrough - it's
// built from the viewer's own isIOS/isAndroid (see usePwaInstall.js)
// instead of being static data: showing all three platforms to everyone
// just made people read past the two that don't apply to them.
export function getGettingStartedCards({ isIOS, isAndroid }) {
  let shareCard;
  if (isIOS) {
    shareCard = {
      icon: '🍏',
      title: '5. שיתוף ישיר מפייסבוק',
      body: 'באייפון אין אפשרות "שיתוף" ישירה מפייסבוק לאפליקציה בכלל, גם עם התקנה (מגבלה של אפל, לא ניתנת לעקיפה). במקום זאת: מעתיקים את הקישור לפוסט או את הטקסט שלו, או מצלמים מסך שלו, ומדביקים/מעלים ב"הוספה חכמה" (אם לא בטוחים מה זה) או ישירות בטופס הספציפי (חתול/כלב, אבד/נמצא) אם כבר יודעים.',
    };
  } else if (isAndroid) {
    shareCard = {
      icon: '🤖',
      title: '5. שיתוף ישיר מפייסבוק',
      body: 'אחרי התקנת האפליקציה למסך הבית (מתפריט החשבון ⚙️ ← "התקנת האפליקציה"), אפשר ללחוץ "שיתוף" על פוסט בפייסבוק ולבחור "איתור חיות מחמד" מרשימת האפשרויות - בלי התקנה, האפליקציה פשוט לא תופיע שם.',
    };
  } else {
    shareCard = {
      icon: '💻',
      title: '5. שיתוף ישיר מפייסבוק',
      body: 'במחשב אין בכלל תפריט "שיתוף" לאפליקציות חיצוניות (זו יכולת של טלפון בלבד). הדרך להביא פוסט מפייסבוק: מעתיקים את הקישור לפוסט או את הטקסט שלו, או שומרים צילום מסך שלו, ומדביקים/מעלים ב"הוספה חכמה" או ישירות בטופס הספציפי.',
    };
  }
  return [...STATIC_GETTING_STARTED_CARDS_TOP, shareCard, ...STATIC_GETTING_STARTED_CARDS_BOTTOM];
}

export const ADDITIONAL_CARDS = [
  {
    icon: '🐈',
    title: 'חתולים וכלבים בנפרד',
    body: 'מתג חתול/כלב בראש עמוד הבית - לכל סוג חיה הרשימה, הטפסים והגזעים שמתאימים לו.',
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
