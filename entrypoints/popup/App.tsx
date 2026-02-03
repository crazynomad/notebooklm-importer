import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Youtube, Link, List, Rss, BookOpen, Lock } from 'lucide-react';
import type { ImportProgress } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SingleImport } from '@/components/SingleImport';
import { BatchImport } from '@/components/BatchImport';
import { PlaylistImport } from '@/components/PlaylistImport';
import { RssImport } from '@/components/RssImport';
import { DocsImport } from '@/components/DocsImport';

export default function App() {
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);

  return (
    <div className="min-h-[480px] bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-notebooklm-blue flex items-center justify-center">
            <Link className="w-4 h-4 text-white" />
          </div>
          <span className="font-medium text-gray-900">NotebookLM Importer</span>
        </div>
      </div>

      {/* Progress indicator */}
      {importProgress && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-blue-700">
              正在导入 {importProgress.completed}/{importProgress.total}
            </span>
            {importProgress.current && (
              <span className="text-blue-500 truncate max-w-[200px]">
                {importProgress.current.url}
              </span>
            )}
          </div>
          <div className="w-full bg-blue-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{
                width: `${(importProgress.completed / importProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs.Root defaultValue="single" className="flex flex-col">
        <Tabs.List className="flex border-b border-gray-100">
          {[
            { value: 'single', icon: Link, label: '单个导入', locked: false },
            { value: 'batch', icon: List, label: '批量导入', locked: false },
            { value: 'playlist', icon: Youtube, label: '播放列表', locked: true },
            { value: 'rss', icon: Rss, label: 'RSS', locked: false },
            { value: 'docs', icon: BookOpen, label: '文档站点', locked: false },
          ].map(({ value, icon: Icon, label, locked }) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className={cn(
                'flex-1 py-3 text-xs font-medium text-gray-500',
                'flex flex-col items-center gap-1 relative',
                'border-b-2 border-transparent',
                'hover:text-gray-700 hover:bg-gray-50',
                'data-[state=active]:text-notebooklm-blue data-[state=active]:border-notebooklm-blue'
              )}
            >
              <div className="relative">
                <Icon className="w-4 h-4" />
                {locked && (
                  <Lock className="w-2.5 h-2.5 absolute -top-1 -right-2 text-yellow-500" />
                )}
              </div>
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="single" className="p-4">
          <SingleImport onProgress={setImportProgress} />
        </Tabs.Content>

        <Tabs.Content value="batch" className="p-4">
          <BatchImport onProgress={setImportProgress} />
        </Tabs.Content>

        <Tabs.Content value="playlist" className="p-4">
          <PlaylistImport onProgress={setImportProgress} />
        </Tabs.Content>

        <Tabs.Content value="rss" className="p-4">
          <RssImport onProgress={setImportProgress} />
        </Tabs.Content>

        <Tabs.Content value="docs" className="p-4">
          <DocsImport onProgress={setImportProgress} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
