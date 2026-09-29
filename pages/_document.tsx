import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Standard Favicon (.ico) */}
        <link rel="icon" href="/favicon.ico" sizes="any" />

        {/* Crisp Vector Favicon for modern browsers */}
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />

        {/* iOS / Apple Touch Icon */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* App Title */}
        <title>Outbount</title>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}