import { createServerSupabaseClient } from '../../lib/supabase/server';
import RegistrationForm from '../../components/RegistrationForm';

export default async function RegisterPage() {
  const enabled=process.env.DIRECTORY_WRITE_MODE==='restricted';
  const user=enabled?(await (await createServerSupabaseClient()).auth.getUser()).data.user:null;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">تسجيل شركة جديدة</h1>
      <RegistrationForm key={user?.id??'visitor'} ownerId={user?.id} enableAttemptResume={enabled} />
    </div>
  );
}
