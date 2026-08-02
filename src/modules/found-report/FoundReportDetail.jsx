import { Link, useParams } from 'react-router-dom';

export default function FoundReportDetail() {
  const { reportId } = useParams();

  return (
    <div className="mx-auto max-w-lg p-4 text-center">
      <h1 className="mb-2 text-xl font-bold text-slate-800">תודה על הדיווח!</h1>
      <p className="mb-6 text-slate-500">
        הדיווח נשמר במאגר ויבדק מול תיקי החיפוש הפעילים. מזהה הדיווח: {reportId}
      </p>
      <Link to="/" className="text-slate-700 underline">
        חזרה לעמוד הראשי
      </Link>
    </div>
  );
}
