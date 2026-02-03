import { useState, useEffect } from 'react';
import { Youtube, Loader2, CheckCircle, AlertCircle, Play, Lock } from 'lucide-react';
import type { ImportProgress, PlaylistItem, SubscriptionStatus } from '@/lib/types';
import { extractYouTubePlaylistId } from '@/lib/utils';
import { CHANNEL_CONFIG } from '@/lib/config';

interface Props {
  onProgress: (progress: ImportProgress | null) => void;
}

type State = 'idle' | 'loading' | 'loaded' | 'importing' | 'success' | 'error';
type AuthState = 'checking' | 'verified' | 'unverified' | 'error';

export function PlaylistImport({ onProgress }: Props) {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [videos, setVideos] = useState<PlaylistItem[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');
  const [results, setResults] = useState<{ success: number; failed: number } | null>(null);

  // Subscription verification state
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    // Check cached subscription on mount
    chrome.runtime.sendMessage({ type: 'GET_CACHED_SUBSCRIPTION' }, (response) => {
      if (response?.success && response.data?.isSubscribed) {
        setAuthState('verified');
      } else {
        setAuthState('unverified');
      }
    });
  }, []);

  const handleVerifySubscription = () => {
    setAuthState('checking');
    setAuthError('');

    chrome.runtime.sendMessage({ type: 'CHECK_SUBSCRIPTION' }, (response) => {
      if (response?.success) {
        const status = response.data as SubscriptionStatus;
        setAuthState(status.isSubscribed ? 'verified' : 'unverified');
        if (!status.isSubscribed) {
          setAuthError('请先订阅频道后再使用此功能');
        }
      } else {
        setAuthState('error');
        setAuthError(response?.error || '验证失败，请重试');
      }
    });
  };

  const handleSubscribe = () => {
    chrome.tabs.create({ url: CHANNEL_CONFIG.subscribeUrl });
  };

  const handleLoadPlaylist = async () => {
    const playlistId = extractYouTubePlaylistId(playlistUrl);
    if (!playlistId) {
      setError('请输入有效的 YouTube 播放列表 URL');
      setState('error');
      return;
    }

    setState('loading');
    setError('');
    setVideos([]);

    chrome.runtime.sendMessage(
      { type: 'GET_PLAYLIST_VIDEOS', playlistUrl },
      (response) => {
        if (response?.success && Array.isArray(response.data)) {
          const items = response.data as PlaylistItem[];
          setVideos(items);
          setSelectedVideos(new Set(items.map((v) => v.videoId)));
          setState('loaded');
        } else {
          setState('error');
          setError(response?.error || '获取播放列表失败');
        }
      }
    );
  };

  const handleToggleVideo = (videoId: string) => {
    setSelectedVideos((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedVideos(new Set(videos.map((v) => v.videoId)));
  };

  const handleDeselectAll = () => {
    setSelectedVideos(new Set());
  };

  const handleImport = async () => {
    const urls = videos
      .filter((v) => selectedVideos.has(v.videoId))
      .map((v) => `https://www.youtube.com/watch?v=${v.videoId}`);

    if (urls.length === 0) {
      setError('请至少选择一个视频');
      setState('error');
      return;
    }

    setState('importing');
    setError('');
    setResults(null);

    const progress: ImportProgress = {
      total: urls.length,
      completed: 0,
      items: urls.map((url) => ({ url, status: 'pending' })),
    };
    onProgress(progress);

    chrome.runtime.sendMessage({ type: 'IMPORT_BATCH', urls }, (response) => {
      onProgress(null);

      if (response?.success && response.data) {
        const result = response.data as ImportProgress;
        const success = result.items.filter((i) => i.status === 'success').length;
        const failed = result.items.filter((i) => i.status === 'error').length;

        setResults({ success, failed });
        setState(failed > 0 ? 'error' : 'success');
      } else {
        setState('error');
        setError(response?.error || '导入失败');
      }
    });
  };

  // Show verification UI if not verified
  if (authState !== 'verified') {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-5 h-5 text-yellow-600" />
            <span className="font-medium text-yellow-800">需要订阅验证</span>
          </div>
          <p className="text-sm text-yellow-700 mb-4">
            YouTube 播放列表导入功能需要订阅「
            <span className="font-medium">{CHANNEL_CONFIG.name}</span>
            」频道后使用。
          </p>

          {authState === 'checking' ? (
            <button
              disabled
              className="w-full py-2.5 bg-gray-100 text-gray-400 rounded-lg text-sm flex items-center justify-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              正在验证...
            </button>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleVerifySubscription}
                className="w-full py-2.5 bg-notebooklm-blue text-white rounded-lg text-sm hover:bg-blue-600 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                验证订阅状态
              </button>
              <button
                onClick={handleSubscribe}
                className="w-full py-2.5 bg-youtube-red text-white rounded-lg text-sm hover:bg-red-600 flex items-center justify-center gap-2"
              >
                <Youtube className="w-4 h-4" />
                前往订阅频道
              </button>
            </div>
          )}

          {authError && (
            <div className="flex items-center gap-2 text-red-500 text-sm mt-3">
              <AlertCircle className="w-4 h-4" />
              {authError}
            </div>
          )}
        </div>

        <div className="text-xs text-gray-400">
          <p>其他功能（单个导入、批量导入、RSS、文档站点）无需验证即可使用。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Playlist URL input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          YouTube 播放列表 URL
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="url"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              placeholder="https://www.youtube.com/playlist?list=..."
              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-notebooklm-blue focus:border-transparent"
            />
          </div>
          <button
            onClick={handleLoadPlaylist}
            disabled={!playlistUrl || state === 'loading'}
            className="px-4 py-2 bg-youtube-red text-white text-sm rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {state === 'loading' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            加载
          </button>
        </div>
      </div>

      {/* Video list */}
      {videos.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              已选择 {selectedVideos.size}/{videos.length} 个视频
            </span>
            <div className="flex gap-2 text-xs">
              <button onClick={handleSelectAll} className="text-notebooklm-blue hover:underline">
                全选
              </button>
              <button onClick={handleDeselectAll} className="text-gray-400 hover:underline">
                取消全选
              </button>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
            {videos.map((video) => (
              <label
                key={video.videoId}
                className="flex items-center gap-3 p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedVideos.has(video.videoId)}
                  onChange={() => handleToggleVideo(video.videoId)}
                  className="rounded border-gray-300 text-notebooklm-blue focus:ring-notebooklm-blue"
                />
                {video.thumbnail && (
                  <img
                    src={video.thumbnail}
                    alt=""
                    className="w-12 h-9 object-cover rounded"
                  />
                )}
                <span className="flex-1 text-sm text-gray-700 line-clamp-2">{video.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Import button */}
      {videos.length > 0 && (
        <button
          onClick={handleImport}
          disabled={selectedVideos.size === 0 || state === 'importing'}
          className="w-full py-2.5 bg-notebooklm-blue text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {state === 'importing' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              正在导入...
            </>
          ) : (
            <>
              <Youtube className="w-4 h-4" />
              导入选中视频 ({selectedVideos.size})
            </>
          )}
        </button>
      )}

      {/* Results */}
      {results && (
        <div
          className={`flex items-center gap-2 text-sm rounded-lg p-3 ${
            results.failed > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-600'
          }`}
        >
          {results.failed > 0 ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          成功 {results.success} 个{results.failed > 0 && `，失败 ${results.failed} 个`}
        </div>
      )}

      {state === 'error' && !results && (
        <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
}
