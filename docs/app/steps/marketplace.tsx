'use client';

import { useState } from 'react';
import Link from 'next/link';
import { stepsData, type StepCategory, type StepType } from './steps-data';
import { Search, Grid, Triangle, Wrench, Clock } from 'lucide-react';

export function StepsMarketplace() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<
    StepCategory | 'Any Category' | null
  >('Any Category');
  const [selectedType, setSelectedType] = useState<
    StepType | 'Any Type' | null
  >('Any Type');
  const [showRecentlyAdded, setShowRecentlyAdded] = useState(false);

  const categories: Array<StepCategory | 'Any Category'> = [
    'Any Category',
    'AI',
    'Storage',
    'Authentication',
    'Messaging',
    'Data Processing',
    'External Services',
    'Utilities',
    'Webhooks',
  ];

  const types: Array<StepType | 'Any Type'> = [
    'Any Type',
    'Native',
    'External',
  ];

  // Filter steps
  const filteredSteps = stepsData.filter((step) => {
    const matchesSearch =
      step.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      step.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'Any Category' || step.category === selectedCategory;
    const matchesType =
      selectedType === 'Any Type' || step.type === selectedType;
    const matchesRecent = !showRecentlyAdded || (step.downloads ?? 0) < 7000; // Simulate recently added

    return matchesSearch && matchesCategory && matchesType && matchesRecent;
  });

  const featuredSteps = filteredSteps.filter((step) => step.featured);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Marketplace</h1>
      </div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-background px-4 py-6">
          <nav className="space-y-6">
            {/* Filter by Type */}
            <div>
              <button
                type="button"
                onClick={() => {
                  setSelectedType('Any Type');
                  setSelectedCategory('Any Category');
                  setShowRecentlyAdded(false);
                }}
                className="mb-3 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Grid className="size-4" />
                Any Type
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedType('Native');
                  setSelectedCategory('Any Category');
                  setShowRecentlyAdded(false);
                }}
                className="mb-3 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Triangle className="size-4" />
                Native
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedType('External');
                  setSelectedCategory('Any Category');
                  setShowRecentlyAdded(false);
                }}
                className="mb-3 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Wrench className="size-4" />
                External
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRecentlyAdded(true);
                  setSelectedType('Any Type');
                  setSelectedCategory('Any Category');
                }}
                className="mb-3 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Clock className="size-4" />
                Recently Added
              </button>
            </div>

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
                      setShowRecentlyAdded(false);
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
              <input
                type="text"
                placeholder="Search integrations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Featured Section */}
          {featuredSteps.length > 0 &&
            !searchQuery &&
            !showRecentlyAdded &&
            selectedCategory === 'Any Category' &&
            selectedType === 'Any Type' && (
              <section className="mb-12">
                <h2 className="mb-2 text-xl font-semibold">Featured</h2>
                <p className="mb-6 text-sm text-muted-foreground">
                  A selection of integrations curated by our marketplace team.
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {featuredSteps.map((step) => (
                    <StepCard key={step.id} step={step} />
                  ))}
                </div>
              </section>
            )}

          {/* All Steps Grid */}
          <section>
            {searchQuery ||
            selectedCategory !== 'Any Category' ||
            selectedType !== 'Any Type' ||
            showRecentlyAdded ? (
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
      AI: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      Storage:
        'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
      Authentication:
        'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
      Messaging:
        'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
      'Data Processing':
        'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
      'External Services':
        'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
      Utilities:
        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      Webhooks:
        'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
        <span className="text-2xl font-bold text-muted-foreground">
          {step.name.charAt(0)}
        </span>
      </div>

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
        {step.downloads && (
          <span>{(step.downloads / 1000).toFixed(1)}k downloads</span>
        )}
      </div>
    </Link>
  );
}
