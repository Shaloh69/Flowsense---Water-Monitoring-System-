import { Html, Head, Main, NextScript } from "next/document";
import clsx from "clsx";
import { fontSans } from "@/config/fonts";

export default function Document() {
  return (
    <Html lang="en" className="dark">
      <Head>
        <meta name="theme-color" content="#2563eb" />
      </Head>
      <body className={clsx("min-h-screen font-sans antialiased", fontSans.variable)}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
