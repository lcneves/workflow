import '../global.css';
import { mono, sans } from '@/lib/geistdocs/fonts';
import { cn } from '@/lib/utils';

const Layout = async ({ children }: LayoutProps<'/'>) => (
  <html
    className={cn(sans.variable, mono.variable, 'scroll-smooth antialiased')}
    lang="en"
    suppressHydrationWarning
  >
    <body>{children}</body>
  </html>
);

export default Layout;
