import type { AppProps } from "next/app";
import { HeroUIProvider } from "@heroui/system";
import { ToastProvider } from "@heroui/toast";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useState } from "react";

import { fontSans } from "@/config/fonts";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <HeroUIProvider navigate={router.push}>
        <NextThemesProvider attribute="class" defaultTheme="dark">
          <ToastProvider maxVisibleToasts={5} placement="top-right" />
          <style jsx global>{`
            :root {
              --font-sans: ${fontSans.style.fontFamily};
            }
          `}</style>
          <Component {...pageProps} />
        </NextThemesProvider>
      </HeroUIProvider>
    </QueryClientProvider>
  );
}
