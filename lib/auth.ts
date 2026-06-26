'use server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

function createSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: any) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );
}

export async function signUp(email: string, password: string, username: string) {
  const supabase = createSupabaseServer();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, full_name: username },
    },
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function signIn(email: string, password: string) {
  const supabase = createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect('/');
}

export async function signOut() {
  const supabase = createSupabaseServer();
  await supabase.auth.signOut();
  redirect('/');
}

export async function getSession() {
  const supabase = createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
