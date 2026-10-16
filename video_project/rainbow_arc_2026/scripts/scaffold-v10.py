from pathlib import Path
root=Path(__file__).resolve().parents[1]
src=root/'src'
# The episode's copied .ts sources are ordinary files. Original V09 assets and
# their read-only hard links are never rewritten.
for name,old,new in [
 ('WorldV10.ts','WorldV09','WorldV10'),
 ('CinematicRouteV10.ts','posesV09','posesV10'),
 ('V10RainbowArcFilm.tsx','V09RainbowArcFilm','V10RainbowArcFilm'),
 ('EditorialOverlayV10.tsx','V09','V10')]:
 base={'WorldV10.ts':'WorldV09.ts','CinematicRouteV10.ts':'CinematicRouteV09.ts','V10RainbowArcFilm.tsx':'V09RainbowArcFilm.tsx','EditorialOverlayV10.tsx':'EditorialOverlayV09.tsx'}[name]
 text=(src/base).read_text('utf8').replace(old,new)
 if name=='V10RainbowArcFilm.tsx':
  text=text.replace("import {AnimatedObserverV09} from './AnimatedObserverV09';","import {FishObserverV10} from './FishObserverV10';")
  text=text.replace('AnimatedObserverV09','FishObserverV10').replace('WorldV09','WorldV10').replace('./CinematicRouteV09','./CinematicRouteV10').replace('EditorialOverlayV09','EditorialOverlayV10').replace('microStrengthV09','microStrengthV10')
  text=text.replace('V09 cinematic optical world assets','V10 rainbow fish cinematic optical world assets')
  text=text.replace('assets_v09/characters/robot_expressive/RobotExpressive-original.glb','assets_v10/characters/rainbow_fish.glb').replace('audio/master-v07.wav','audio_v10/master-v10.wav')
 (src/name).write_text(text,'utf8')
(src/'index.tsx').write_text((src/'index.tsx').read_text('utf8').replace('V09RainbowArcFilm','V10RainbowArcFilm'),'utf8')
# All powers of signed GLSL terms use abs before pow: GLSL pow on negative
# bases is undefined even for an integer-looking floating exponent.
for name in ['WorldV10.ts','MacroLookV09.ts','RainbowAtmosphereV09.ts','SpectralRibbonV09.ts']:
 p=src/name;text=p.read_text('utf8')
 for old,new in [
  ('pow((fract(vUv.y+uTime*.10)-.48)/.06,2.)','pow(abs((fract(vUv.y+uTime*.10)-.48)/.06),2.)'),
  ('pow((local.x+.55)*13.,2.)','pow(abs((local.x+.55)*13.),2.)'),
  ('pow((x-.23)/.50,2.0)','pow(abs((x-.23)/.50),2.0)'),
  ('pow((wave-.5)/.105,2.)','pow(abs((wave-.5)/.105),2.)'),
  ('pow((vUv.y-.5)/.36,2.)','pow(abs((vUv.y-.5)/.36),2.)')]:text=text.replace(old,new)
 p.write_text(text,'utf8')
print('Created V10 film/world/camera/editorial sources; original V09 project unchanged.')
