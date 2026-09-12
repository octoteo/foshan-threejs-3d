import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { FOSHAN, OVERTURE_BUILDINGS_URL, OVERTURE_RELEASE, TERRARIUM_TEMPLATE } from '../config.js';
import { STAGE2_LANDMARKS } from './landmarks.js';
import { LandmarkThreeLayer } from './landmarkLayer.js';
import './styles.css';

const $ = selector => document.querySelector(selector);
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const HEIGHT_EXPR = ['case',['has','height'],['to-number',['get','height'],12],['has','num_floors'],['*',['to-number',['get','num_floors'],4],3.2],12];
const BASE_EXPR = ['case',['has','min_height'],['to-number',['get','min_height'],0],0];
let mode = '2d', overlaysInstalled = false, mapLoaded = false, sourceReady = false;
let lastFrameAt = performance.now(), frameCount = 0;
window.__foshanErrors = [];
window.addEventListener('error', event => window.__foshanErrors.push(event.message || 'error'));
window.addEventListener('unhandledrejection', event => window.__foshanErrors.push(String(event.reason?.message || event.reason || 'rejection')));
document.documentElement.dataset.mapEngine = 'maplibre';
document.documentElement.dataset.mapMode = mode;
document.documentElement.dataset.appVersion = '2.0.0-beta.1';
function setStatus(text,tone=''){const node=$('#status');node.textContent=text;node.dataset.tone=tone;}
function firstSymbolLayerId(){return map.getStyle().layers?.find(layer=>layer.type==='symbol')?.id;}
function hideBasemapBuildings(){for(const layer of map.getStyle().layers||[]){if(layer['source-layer']==='building'){try{map.setLayoutProperty(layer.id,'visibility','none');}catch{}}}}
function addOvertureBuildings(){
  if(!map.getSource('overture-buildings')) map.addSource('overture-buildings',{type:'vector',url:`pmtiles://${OVERTURE_BUILDINGS_URL}`,attribution:'Buildings © OpenStreetMap contributors, Overture Maps Foundation'});
  const before=firstSymbolLayerId();
  if(!map.getLayer('overture-building-2d')) map.addLayer({id:'overture-building-2d',type:'fill',source:'overture-buildings','source-layer':'building',minzoom:13,paint:{'fill-color':['case',['boolean',['get','has_parts'],false],'#d8d1c7','#d2cbc0'],'fill-opacity':.52,'fill-outline-color':'#b7afa3'}},before);
  if(!map.getLayer('overture-building-3d')) map.addLayer({id:'overture-building-3d',type:'fill-extrusion',source:'overture-buildings','source-layer':'building',minzoom:13,layout:{visibility:'none'},paint:{'fill-extrusion-color':['interpolate',['linear'],HEIGHT_EXPR,0,'#d8d1c8',35,'#c6c2bc',90,'#b9bec3',180,'#aeb9c5'],'fill-extrusion-height':HEIGHT_EXPR,'fill-extrusion-base':BASE_EXPR,'fill-extrusion-opacity':.9,'fill-extrusion-vertical-gradient':true}},before);
  if(!map.getLayer('overture-building-parts-3d')) map.addLayer({id:'overture-building-parts-3d',type:'fill-extrusion',source:'overture-buildings','source-layer':'building_part',minzoom:14,layout:{visibility:'none'},paint:{'fill-extrusion-color':'#c7c6c3','fill-extrusion-height':HEIGHT_EXPR,'fill-extrusion-base':BASE_EXPR,'fill-extrusion-opacity':.94,'fill-extrusion-vertical-gradient':true}},before);
}
function addTerrain(){if(!map.getSource('foshan-dem')) map.addSource('foshan-dem',{type:'raster-dem',tiles:[TERRARIUM_TEMPLATE],tileSize:256,maxzoom:15,encoding:'terrarium',attribution:'Terrain Tiles / Mapzen'});}
function installOverlays(){if(overlaysInstalled)return;hideBasemapBuildings();addOvertureBuildings();addTerrain();if(!map.getLayer('foshan-landmark-models'))map.addLayer(new LandmarkThreeLayer());overlaysInstalled=true;sourceReady=true;document.documentElement.dataset.buildingSource='ready';document.documentElement.dataset.appReady='true';setStatus(`地图底座已连接 · Overture ${OVERTURE_RELEASE}`,'ok');syncModeLayers(false);}
function syncModeLayers(animate=true){if(!overlaysInstalled)return;const is3d=mode==='3d';map.setLayoutProperty('overture-building-2d','visibility',is3d?'none':'visible');map.setLayoutProperty('overture-building-3d','visibility',is3d?'visible':'none');map.setLayoutProperty('overture-building-parts-3d','visibility',is3d?'visible':'none');map.setTerrain(is3d?{source:'foshan-dem',exaggeration:1}:null);const camera=is3d?{pitch:58,bearing:-18,zoom:Math.max(13.8,map.getZoom())}:{pitch:0,bearing:0,zoom:Math.min(15.2,map.getZoom())};animate?map.easeTo({...camera,duration:850}):map.jumpTo(camera);$('#mode2dBtn').classList.toggle('active',!is3d);$('#mode3dBtn').classList.toggle('active',is3d);$('#modeBadge').textContent=is3d?'3D 城市':'2D 地图';document.documentElement.dataset.mapMode=mode;}
function setMode(nextMode){mode=nextMode==='3d'?'3d':'2d';syncModeLayers(true);}
function renderLandmarks(){const list=$('#landmarkList');list.replaceChildren();for(const place of STAGE2_LANDMARKS){const button=document.createElement('button');button.className='landmark-item';const title=document.createElement('strong'),meta=document.createElement('span'),badge=document.createElement('em');title.textContent=place.name;meta.textContent=`${place.district} · 高精模型位`;badge.textContent='定位';button.append(title,meta,badge);button.addEventListener('click',()=>{mode='3d';syncModeLayers(false);map.flyTo({center:[place.lon,place.lat],zoom:place.zoom,pitch:place.pitch,bearing:place.bearing,duration:1400,essential:true});});list.appendChild(button);}}
function updateReadout(){const center=map.getCenter();$('#coordStats').textContent=`${center.lng.toFixed(5)}, ${center.lat.toFixed(5)}`;$('#zoomStats').textContent=`z${map.getZoom().toFixed(2)}`;$('#pitchStats').textContent=`${Math.round(map.getPitch())}°`;}
function frameTick(now){frameCount++;if(now-lastFrameAt>=1000){$('#fps').textContent=String(Math.round(frameCount*1000/(now-lastFrameAt)));frameCount=0;lastFrameAt=now;}requestAnimationFrame(frameTick);}requestAnimationFrame(frameTick);
const map=new maplibregl.Map({container:'map',style:OPENFREEMAP_STYLE,center:FOSHAN.center,zoom:10.7,pitch:0,bearing:0,minZoom:7.5,maxZoom:20,maxPitch:80,attributionControl:true,hash:true,canvasContextAttributes:{antialias:true}});
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'bottom-right');map.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'metric'}),'bottom-left');map.addControl(new maplibregl.FullscreenControl(),'bottom-right');
map.on('load',()=>{mapLoaded=true;installOverlays();renderLandmarks();updateReadout();});map.on('style.load',()=>{if(!mapLoaded)return;overlaysInstalled=false;installOverlays();});map.on('move',updateReadout);map.on('error',event=>{const message=String(event?.error?.message||event?.message||'map error');window.__foshanErrors.push(message);if(!sourceReady){document.documentElement.dataset.runtimeError=message.slice(0,180);setStatus('地图数据连接异常，正在重试…','error');}});
$('#mode2dBtn').addEventListener('click',()=>setMode('2d'));$('#mode3dBtn').addEventListener('click',()=>setMode('3d'));$('#homeBtn').addEventListener('click',()=>{mode='2d';syncModeLayers(false);map.flyTo({center:FOSHAN.center,zoom:10.7,pitch:0,bearing:0,duration:1000});});$('#landmarkToggle').addEventListener('click',()=>$('#landmarkPanel').classList.toggle('collapsed'));$('#legacyBtn').addEventListener('click',()=>{location.href='./legacy.html';});setStatus('正在连接佛山地图底座…');
