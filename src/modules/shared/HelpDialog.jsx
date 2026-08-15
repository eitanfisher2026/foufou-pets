/**
 * Static "how does this work" explainer, reached via the ℹ️ button next to
 * the dashboard header. Content is fixed in code (not admin-editable like
 * AboutDialog.jsx) - this is onboarding copy, not something that needs to
 * change without a deploy.
 */
export default function HelpDialog({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-l from-blue-500 to-indigo-500 px-4 py-3 text-white">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <span>ℹ️</span> איך זה עובד?
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-xl leading-none text-white/90">
            ✕
          </button>
        </div>

        <div className="space-y-4 p-4 text-sm text-slate-700">
          <p>
            <strong>חיות אבודות</strong> עוזר לך לנהל חיפוש אחר חיית מחמד אבודה, ולהתאים בינה לבין דיווחים על חיות
            שנראו/נמצאו.
          </p>

          <div>
            <p className="mb-1 font-bold text-slate-800">שלושה שלבים:</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>
                <strong>דיווח על אבידה</strong> - כשחתול/כלב שלכם אבד, פותחים תיק חיפוש חדש
              </li>
              <li>
                <strong>דיווח על מציאה</strong> - כשרואים או מוצאים חיה, מדווחים עליה כאן
              </li>
              <li>
                <strong>בדיקת התאמות</strong> - בכל תיק חיפוש אפשר ללחוץ "בדיקת התאמות" כדי להשוות מול הדיווחים שנמצאו
              </li>
            </ol>
          </div>

          <div>
            <p className="mb-1 font-bold text-slate-800">איך ממלאים דיווח:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>הכי מהיר: העלאת צילום מסך של הפוסט מפייסבוק - נזהה אוטומטית חלק גדול מהפרטים</li>
              <li>אפשר גם למלא טופס ידני מלא, בלי צילום מסך</li>
              <li>"הוספה חכמה" בעמוד הראשי מזהה אוטומטית גם אם זו אבידה או מציאה, וגם אם זה חתול או כלב</li>
            </ul>
          </div>

          <div>
            <p className="mb-1 font-bold text-slate-800">תפריט הפרופיל (התמונה למעלה מימין):</p>
            <ul className="list-inside list-disc space-y-1">
              <li>הגדרות (למנהלים)</li>
              <li>שיתוף האפליקציה והתקנה על מסך הבית</li>
              <li>שליחת משוב</li>
              <li>אודות</li>
            </ul>
          </div>

          <p className="text-slate-500">
            <strong>טיפ:</strong> ככל שיהיה יותר מידע בדיווח (צבע, סימנים מיוחדים, מיקום), כך ההתאמה תהיה מדויקת יותר.
          </p>
        </div>

        <div className="border-t border-slate-100 px-4 py-3 text-center">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-6 py-2 text-sm font-medium text-white">
            סגירה
          </button>
        </div>
      </div>
    </div>
  );
}
