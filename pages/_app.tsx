import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { SessionProvider, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ThemeProvider";

const isPublicPath = (path: string) => path === "/login" || path.startsWith("/invite/");

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session && !isPublicPath(router.pathname)) {
      router.replace("/login");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
        <span className="loading loading-spinner loading-sm text-neutral-400" aria-label="Loading Outbount" />
      </div>
    );
  }

  if (!session && !isPublicPath(router.pathname)) return null;

  return <>{children}</>;
}

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    // attribute="class" → next-themes adds/removes class="dark" on <html>
    // The globals.css + DaisyUI plugin handle the rest via .dark selector
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider session={session}>
        <AuthGuard>
          <Layout>
            <Component {...pageProps} />
            <Toaster theme="system" position="bottom-right" richColors closeButton />
          </Layout>
        </AuthGuard>
      </SessionProvider>
    </ThemeProvider>
  );
}
