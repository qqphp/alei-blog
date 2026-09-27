export const tracks = [
  { id: 'blue-hour', title: '蓝调时刻', artist: 'AI 合成示例', src: '/audio/blue-hour.wav', duration: 48, mood: '安静工作' },
  { id: 'window-light', title: '窗边日光', artist: 'AI 合成示例', src: '/audio/window-light.wav', duration: 48, mood: '午后阅读' },
  { id: 'night-walk', title: '夜行微光', artist: 'AI 合成示例', src: '/audio/night-walk.wav', duration: 48, mood: '夜间漫游' },
];

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
