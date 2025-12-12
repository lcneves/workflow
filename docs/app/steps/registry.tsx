'use client';

import { Grid, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { type StepCategory, stepsData } from './steps-data';

export function StepsRegistry() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<
    StepCategory | 'Any Category' | null
  >('Any Category');

  const categories: Array<StepCategory | 'Any Category'> = [
    'Any Category',
    'AI Agents & Services',
    'AI',
    'Analytics',
    'Authentication',
    'CMS',
    'Commerce',
    'Database',
    'DevTools',
    'Experimentation',
    'Flags',
    'Logging',
    'Messaging',
    'Monitoring',
    'Observability',
    'Payments',
    'Productivity',
    'Searching',
    'Security',
    'Storage',
    'Testing',
    'Video',
    'Webhooks',
    'Workflow',
  ];

  // Filter steps
  const filteredSteps = stepsData.filter((step) => {
    const matchesSearch =
      step.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      step.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'Any Category' || step.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Registry</h1>
      </div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-background px-4 py-6">
          <nav className="space-y-6">
            {/* Categories */}
            <div>
              <h3 className="mb-3 px-3 text-sm font-semibold">Categories</h3>
              <div className="space-y-1">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(category);
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                      selectedCategory === category
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {category === 'Any Category' && <Grid className="size-4" />}
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-6 py-6">
          {/* Search Bar */}
          <div className="mb-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search integrations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 pl-10"
              />
            </div>
          </div>

          {/* All Steps Grid */}
          <section>
            {searchQuery || selectedCategory !== 'Any Category' ? (
              <h2 className="mb-6 text-xl font-semibold">
                {filteredSteps.length} result
                {filteredSteps.length !== 1 ? 's' : ''}
              </h2>
            ) : null}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredSteps.map((step) => (
                <StepCard key={step.id} step={step} />
              ))}
            </div>
            {filteredSteps.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                No steps found matching your criteria.
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function StepCard({ step }: { step: (typeof stepsData)[0] }) {
  const getCategoryBadgeColor = (category: StepCategory) => {
    const colors: Record<StepCategory, string> = {
      'AI Agents & Services':
        'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
      AI: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      Analytics:
        'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
      Authentication:
        'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
      CMS: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300',
      Commerce:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      Database: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
      DevTools:
        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      Experimentation:
        'bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300',
      Flags:
        'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      Logging:
        'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
      Messaging:
        'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
      Monitoring: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
      Observability:
        'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
      Payments:
        'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
      Productivity:
        'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
      Searching:
        'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
      Security: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
      Storage:
        'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
      Testing: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
      Video:
        'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
      Webhooks:
        'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
      Workflow: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    };
    return colors[category];
  };

  return (
    <Link
      href={`/steps/${step.id}`}
      className="group relative flex aspect-square flex-col justify-between rounded-lg border border-border bg-card p-6 transition-all hover:border-primary hover:shadow-md"
    >
      {/* Category Badge */}
      <div className="mb-4">
        <span
          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${getCategoryBadgeColor(step.category)}`}
        >
          {step.category}
        </span>
      </div>

      {/* Icon/Logo Placeholder */}
      {/* <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
        <span className="text-2xl font-bold text-muted-foreground">
          {step.name.charAt(0)}
        </span>
      </div> */}

      {/* Content */}
      <div className="flex-1">
        <h3 className="mb-2 font-semibold text-foreground group-hover:text-primary">
          {step.name}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-3">
          {step.description}
        </p>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{step.author}</span>
        {/* {step.downloads && (
          <span>{(step.downloads / 1000).toFixed(1)}k downloads</span>
        )} */}
      </div>
    </Link>
  );
}
