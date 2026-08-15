import { useAuth } from './AuthProvider.jsx';
import AppFooter from '../shared/AppFooter.jsx';

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-amber-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-2 text-2xl font-bold text-slate-800">איתור חיות מחמד</h1>
        <p className="mb-8 text-slate-500">מערכת לניהול חיפוש אחר חיית מחמד אבודה</p>
        <button
          onClick={signInWithGoogle}
          className="w-full rounded-xl bg-slate-800 px-4 py-3 font-medium text-white transition hover:bg-slate-700"
        >
          התחברות עם Google
        </button>
      </div>
      <div className="mt-6 w-full max-w-sm">
        <AppFooter />
      </div>
    </div>
  );
}
