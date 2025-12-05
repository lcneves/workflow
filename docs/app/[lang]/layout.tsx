import '../global.css';
import { Footer } from '@/components/geistdocs/footer';
import { Navbar } from '@/components/geistdocs/navbar';
import { GeistdocsProvider } from '@/components/geistdocs/provider';

const Layout = async ({ children, params }: LayoutProps<'/[lang]'>) => {
  const { lang } = await params;

  return (
    <GeistdocsProvider lang={lang}>
      <Navbar />
      {children}
      <Footer />
    </GeistdocsProvider>
  );
};

export default Layout;
