'use client';
import Image from 'next/image';
import { useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import {
  ArrowUpRight,
  Headphones,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useContent } from './content-provider';
import { useMusic } from './music-player';
import { formatTime } from '@/lib/music';
import type { MusicTrack } from '@/lib/music-content';
import './music-library.css';

export function MusicLibrary() {
  const { tracks: music } = useContent();
  const {
    index,
    playing,
    toggle,
    playQueue,
    skip,
    time,
    duration,
    queueTitle,
  } = useMusic();
  const [tab, setTab] = useState('tracks');
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [mood, setMood] = useState('');
  const [page, setPage] = useState(1);
  const selectedPlaylist = music.playlists.find((item) => item.id === selected);
  const current = music.items[index];
  const playlistSongs = selectedPlaylist?.songs ?? [];
  const filteredSongs = playlistSongs
    .map((song, index) => ({ ...song, position: index + 1 }))
    .filter((song) =>
      `${song.title} ${song.artist}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    );
  const tracks = music.items;
  const filteredTracks = tracks.filter(
    (item) =>
      (!mood || item.mood === mood) &&
      `${item.title} ${item.artist} ${item.mood}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const filteredPlaylists = music.playlists.filter((item) =>
    `${item.title} ${item.description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const showPlaylists = tab === 'playlists' && !selectedPlaylist;
  const count = showPlaylists
    ? filteredPlaylists.length
    : selectedPlaylist
      ? filteredSongs.length
      : filteredTracks.length;
  const size = showPlaylists ? 12 : 25;
  const pages = Math.max(1, Math.ceil(count / size));
  const currentPage = Math.min(page, pages);
  const reset = () => {
    setQuery('');
    setMood('');
    setPage(1);
  };
  function playList(items: MusicTrack[], id?: string) {
    playQueue(
      items.map((item) => item.id),
      id,
      '我的音乐',
    );
  }
  return (
    <div className="music-archive">
      <section className="music-archive-intro" aria-label="音乐档案">
        <div>
          <p>PERSONAL SOUND ARCHIVE / 开发阿雷</p>
          <h2>
            给日常，<span>换一条音轨。</span>
          </h2>
        </div>
        <div className="music-archive-count">
          <span>
            <b>{String(music.items.length).padStart(2, '0')}</b>首音乐
          </span>
          <i>/</i>
          <span>
            <b>{String(music.playlists.length).padStart(2, '0')}</b>张歌单
          </span>
        </div>
      </section>
      <div className="music-archive-layout">
        <aside className="music-player-card" aria-label="音乐播放台">
          <div className="music-player-eyebrow">
            <Headphones size={18} />
            <span>{playing ? 'NOW PLAYING' : 'READY TO LISTEN'}</span>
          </div>
          <div className="music-player-type" aria-hidden="true">
            ON
            <br />
            <span>REPEAT.</span>
          </div>
          <div className="music-player-title">
            <span>{queueTitle}</span>
            <h3>{current?.title ?? '等待一段声音'}</h3>
            <p>{current?.artist ?? '音乐库暂时还没有歌曲'}</p>
          </div>
          <div className="music-player-progress">
            <progress
              max={duration || 1}
              value={Math.min(time, duration)}
              aria-label="当前播放进度"
            />
            <div>
              <span>{formatTime(time)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          <div className="music-player-transport">
            <button
              type="button"
              aria-label="播放台上一首"
              disabled={!current}
              onClick={() => skip(-1)}
            >
              <SkipBack size={18} />
            </button>
            <button
              type="button"
              className="music-player-main"
              aria-label={playing ? '播放台暂停' : '播放台播放'}
              disabled={!current}
              onClick={toggle}
            >
              {playing ? <Pause size={21} /> : <Play size={21} />}
            </button>
            <button
              type="button"
              aria-label="播放台下一首"
              disabled={!current}
              onClick={() => skip(1)}
            >
              <SkipForward size={18} />
            </button>
          </div>
          <p className="music-player-caption">
            从这里开始，带到下一页。
            <br />
            与全局播放器共享同一段声音。
          </p>
        </aside>
        <Tabs.Root
          className="music-catalog"
          value={tab}
          onValueChange={(next) => {
            setTab(String(next));
            setSelected('');
            reset();
          }}
        >
          <Tabs.List className="music-catalog-tabs" aria-label="我的音乐与歌单">
            <Tabs.Tab value="tracks">
              我的音乐 <small>{music.items.length}</small>
            </Tabs.Tab>
            <Tabs.Tab value="playlists">
              我的歌单 <small>{music.playlists.length}</small>
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value={tab}>
            {selectedPlaylist && (
              <section className="music-playlist-detail" aria-label="歌单详情">
                <button
                  type="button"
                  className="music-back"
                  onClick={() => {
                    setSelected('');
                    reset();
                  }}
                >
                  ← 全部歌单
                </button>
                <div className="music-playlist-summary">
                  <div className="music-playlist-mini">
                    {selectedPlaylist.cover ? (
                      <Image
                        src={selectedPlaylist.cover}
                        alt=""
                        width={160}
                        height={160}
                      />
                    ) : (
                      <span aria-hidden="true">
                        MIX
                        <br />
                        TAPE
                      </span>
                    )}
                  </div>
                  <div>
                    <p>PLAYLIST / {playlistSongs.length} 首</p>
                    <h3>{selectedPlaylist.title}</h3>
                    <p>
                      {selectedPlaylist.description || '把喜欢的声音放在一起。'}
                    </p>
                  </div>
                </div>
              </section>
            )}
            <div className="music-catalog-toolbar">
              <div className="music-catalog-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label={
                    showPlaylists
                      ? '搜索我的歌单'
                      : selectedPlaylist
                        ? '搜索歌单曲目'
                        : '搜索我的音乐'
                  }
                  placeholder={
                    showPlaylists
                      ? '找一张歌单…'
                      : selectedPlaylist
                        ? '搜索曲目或作者…'
                        : '搜索歌曲、作者或场景…'
                  }
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
              {tab === 'tracks' && (
                <select
                  aria-label="音乐场景筛选"
                  value={mood}
                  onChange={(event) => {
                    setMood(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">全部场景</option>
                  {music.scenes.map((scene) => (
                    <option key={scene.id} value={scene.name}>
                      {scene.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {showPlaylists ? (
              <>
                <div className="music-catalog-heading">
                  <h3>按心情，挑一张。</h3>
                  <span>{count} 张歌单</span>
                </div>
                <div className="music-playlist-grid">
                  {filteredPlaylists
                    .slice((currentPage - 1) * size, currentPage * size)
                    .map((list) => (
                      <article className="music-playlist-card" key={list.id}>
                        <button
                          type="button"
                          className="music-playlist-open"
                          aria-label={`打开歌单 ${list.title}`}
                          onClick={() => {
                            setSelected(list.id);
                            reset();
                          }}
                        >
                          <div className="music-playlist-cover">
                            {list.cover ? (
                              <Image
                                src={list.cover}
                                alt=""
                                width={420}
                                height={420}
                              />
                            ) : (
                              <>
                                <span className="music-playlist-serial">
                                  MIX /{' '}
                                  {String(
                                    music.playlists.indexOf(list) + 1,
                                  ).padStart(2, '0')}
                                </span>
                                <strong>{list.title}</strong>
                                <span className="music-playlist-cover-footer">
                                  PERSONAL SELECTION <ArrowUpRight size={20} />
                                </span>
                              </>
                            )}
                          </div>
                          <h4>{list.title}</h4>
                        </button>
                        <p>{list.description || '留给喜欢的声音。'}</p>
                        <div className="music-playlist-card-bottom">
                          <span>{list.songs.length} 首曲目</span>
                        </div>
                      </article>
                    ))}
                </div>
              </>
            ) : selectedPlaylist ? (
              <table className="music-playlist-songs" aria-label="歌单曲目列表">
                <thead>
                  <tr>
                    <th scope="col">序号</th>
                    <th scope="col">曲目</th>
                    <th scope="col">作者</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSongs
                    .slice((currentPage - 1) * size, currentPage * size)
                    .map((song) => (
                      <tr key={song.position}>
                        <td>{String(song.position).padStart(2, '0')}</td>
                        <td>{song.title}</td>
                        <td>{song.artist || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <>
                <div className="music-catalog-heading">
                  <h3>
                    {selectedPlaylist ? '歌单曲目' : '一首一首，慢慢收藏。'}
                  </h3>
                  <button
                    type="button"
                    disabled={!filteredTracks.length}
                    onClick={() => playList(filteredTracks)}
                  >
                    <Play size={14} />
                    播放当前列表 <span>{filteredTracks.length}</span>
                  </button>
                </div>
                <div
                  className="music-track-list"
                  aria-label={
                    selectedPlaylist ? '歌单曲目列表' : '我的音乐列表'
                  }
                >
                  <div className="music-track-heading" aria-hidden="true">
                    <span>#</span>
                    <span>曲目 / 作者</span>
                    <span>场景</span>
                    <span>时长</span>
                  </div>
                  {filteredTracks
                    .slice((currentPage - 1) * size, currentPage * size)
                    .map((track, position) => (
                      <article
                        className={`music-track-row${current?.id === track.id ? ' is-current' : ''}`}
                        key={track.id}
                      >
                        <button
                          type="button"
                          className="music-track-play"
                          aria-label={`${current?.id === track.id && playing ? '暂停' : '播放'} ${track.title}`}
                          onClick={() =>
                            current?.id === track.id && playing
                              ? toggle()
                              : playList(filteredTracks, track.id)
                          }
                        >
                          {current?.id === track.id && playing ? (
                            <Pause size={17} />
                          ) : (
                            <>
                              <span>
                                {String(
                                  (currentPage - 1) * size + position + 1,
                                ).padStart(2, '0')}
                              </span>
                              <Play size={16} />
                            </>
                          )}
                        </button>
                        <div className="music-track-name">
                          <button
                            type="button"
                            onClick={() => playList(filteredTracks, track.id)}
                          >
                            {track.title}
                          </button>
                          <p>{track.artist || '作者未填写'}</p>
                        </div>
                        <span className="music-track-mood">
                          {track.mood || '—'}
                        </span>
                        <time>{formatTime(track.duration)}</time>
                      </article>
                    ))}
                </div>
              </>
            )}
            {!count && (
              <div className="music-catalog-empty">
                <Headphones size={28} />
                <h3>
                  {query || mood
                    ? '还没有找到这段声音'
                    : showPlaylists
                      ? '留一个位置，给下一张歌单。'
                      : selectedPlaylist
                        ? '这张歌单还没有曲目'
                        : '音乐库还在等待第一首歌'}
                </h3>
                <p>
                  {query || mood
                    ? '换个关键词，或清空筛选再看看。'
                    : showPlaylists
                      ? '整理好的歌单会出现在这里。'
                      : '发布后的音乐会出现在这里。'}
                </p>
                {(query || mood) && (
                  <button type="button" onClick={reset}>
                    清空筛选
                  </button>
                )}
              </div>
            )}
            <nav className="music-catalog-pagination" aria-label="音乐内容分页">
              <span>
                {count} {showPlaylists ? '张歌单' : '首音乐'} · 第 {currentPage}{' '}
                / {pages} 页
              </span>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                上一页
              </button>
              <button
                type="button"
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                下一页
              </button>
            </nav>
          </Tabs.Panel>
        </Tabs.Root>
      </div>
    </div>
  );
}
