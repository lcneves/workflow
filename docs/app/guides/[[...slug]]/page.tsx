import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import {
  DocsBody as FumadocsDocsBody,
  DocsDescription as FumadocsDocsDescription,
  DocsPage as FumadocsDocsPage,
  DocsTitle as FumadocsDocsTitle,
} from 'fumadocs-ui/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { notFound, redirect } from 'next/navigation';
import type { CSSProperties } from 'react';
import { AskAI } from '@/components/geistdocs/ask-ai';
import { CopyPage } from '@/components/geistdocs/copy-page';
import { EditSource } from '@/components/geistdocs/edit-source';
import { Feedback } from '@/components/geistdocs/feedback';
import { getMDXComponents } from '@/components/geistdocs/mdx-components';
import { OpenInChat } from '@/components/geistdocs/open-in-chat';
import { ScrollTop } from '@/components/geistdocs/scroll-top';
import { TableOfContents } from '@/components/geistdocs/toc';
import * as AccordionComponents from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  getGuidesLLMText,
  getPageImage,
  guidesSource,
} from '@/lib/geistdocs/source';
import { TSDoc } from '@/lib/tsdoc';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';

const containerStyle = {
  '--fd-nav-height': '4rem',
} as CSSProperties;

const Page = async (props: PageProps<'/guides/[[...slug]]'>) => {
  const params = await props.params;

  // Redirect /guides to /guides/ai-agents
  if (!params.slug || params.slug.length === 0) {
    redirect('/guides/ai-agents');
  }

  const page = guidesSource.getPage(params.slug);

  if (!page) {
    notFound();
  }

  const markdown = await getGuidesLLMText(page);
  const MDX = page.data.body;

  return (
    <FumadocsDocsPage
      full={page.data.full}
      toc={page.data.toc}
      article={{ className: 'max-w-[754px]' }}
      container={{
        style: containerStyle,
        className: 'col-span-2',
      }}
      tableOfContent={{
        component: (
          <TableOfContents>
            <EditSource path={page.path} />
            <ScrollTop />
            <Feedback />
            <CopyPage text={markdown} />
            <AskAI href={page.url} />
            <OpenInChat href={page.url} />
          </TableOfContents>
        ),
      }}
    >
      <FumadocsDocsTitle className={cn('text-4xl tracking-tight')}>
        {page.data.title}
      </FumadocsDocsTitle>
      <FumadocsDocsDescription>{page.data.description}</FumadocsDocsDescription>
      <FumadocsDocsBody className={cn('mx-auto w-full')}>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(guidesSource, page),

            // Add your custom components here
            Badge,
            TSDoc,
            Step,
            Steps,
            ...AccordionComponents,
            Tabs,
            Tab,
          })}
        />
      </FumadocsDocsBody>
    </FumadocsDocsPage>
  );
};

export const generateStaticParams = () => [
  { slug: [] }, // Root redirect
  ...guidesSource.generateParams().map((params) => ({
    slug: params.slug,
  })),
];

export const generateMetadata = async (
  props: PageProps<'/guides/[[...slug]]'>
): Promise<Metadata> => {
  const params = await props.params;

  // Root path redirects, no metadata needed
  if (!params.slug || params.slug.length === 0) {
    return { title: 'Guides' };
  }

  const page = guidesSource.getPage(params.slug);

  if (!page) {
    notFound();
  }

  const { segments, url } = getPageImage(page);

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      type: 'article',
      url: page.url,
      images: [
        {
          url,
          width: 1200,
          height: 630,
          alt: segments.join(' - '),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.data.title,
      description: page.data.description,
      images: [url],
    },
  };
};

export default Page;
