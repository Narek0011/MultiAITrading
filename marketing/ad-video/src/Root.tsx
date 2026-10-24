import React from 'react';
import { Composition } from 'remotion';
import { Ad, adFrames } from './Ad';
import { FPS, H, W } from './theme';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="AdEN" component={Ad} durationInFrames={adFrames('en')} fps={FPS} width={W} height={H} defaultProps={{ lang: 'en' as const }} />
    <Composition id="AdES" component={Ad} durationInFrames={adFrames('es')} fps={FPS} width={W} height={H} defaultProps={{ lang: 'es' as const }} />
    {/* v2: same video, no captions over the presenter */}
    <Composition id="AdESv2" component={Ad} durationInFrames={adFrames('es')} fps={FPS} width={W} height={H} defaultProps={{ lang: 'es' as const, introCaptions: false }} />
  </>
);
