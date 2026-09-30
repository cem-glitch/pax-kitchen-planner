import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Image, PanResponder, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import Svg, { Polygon, Polyline, Text as SvgText } from "react-native-svg";

const BLUE="#1677D2", NAVY="#0B1728", BG="#F5F7FA", BORDER="#DDE4EC";
const SHOP_URL="https://paxkok.myshopify.com";

const FALLBACK_PRODUCTS=[
 {id:10057540698449,title:"PizzaMaster PM351ED-1, 1×2 pizzor",vendor:"PIZZAMASTER",product_type:"Pizzaugn",price:"22472.00",image:"https://cdn.shopify.com/s/files/1/0622/8983/8277/files/pm-351ed-1-pizzaugn-kompakt-stenugn-pizzamaster-1-deck-digital-bakepartner-600x600.jpg?v=1743665156",body_html:""},
 {id:10998857531729,title:"PizzaMaster PM 911ED Pizzaugn – PM 900 Series",vendor:"PIZZAMASTER",product_type:"Pizzaugn",price:"55394.00",image:"https://cdn.shopify.com/s/files/1/0622/8983/8277/files/IMG_5052.jpg?v=1785851833",body_html:""},
 {id:10998784557393,title:"PizzaMaster PM 841ED Pizzaugn – PM 800 Series",vendor:"PIZZAMASTER",product_type:"Pizzaugn",price:"78043.00",image:"https://cdn.shopify.com/s/files/1/0622/8983/8277/files/IMG_5047.jpg?v=1785849299",body_html:""}
];

function htmlToText(html=""){
 return String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<script[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&times;/g,"×").replace(/&amp;/g,"&").replace(/\s+/g," ");
}
function fallbackDimensions(p){
 const t=((p.title||"")+" "+(p.product_type||"")).toLowerCase();
 if(t.includes("pizzaugn")||t.includes("ugn")) return {w:1000,d:1000,h:900};
 if(t.includes("kyl")||t.includes("frys")) return {w:600,d:700,h:1900};
 if(t.includes("diskbänk")) return {w:1200,d:700,h:900};
 if(t.includes("arbetsbänk")||t.includes("bänk")) return {w:1200,d:700,h:900};
 if(t.includes("diskmaskin")) return {w:600,d:650,h:850};
 if(t.includes("fritös")) return {w:400,d:700,h:900};
 if(t.includes("grill")) return {w:600,d:700,h:900};
 return {w:600,d:700,h:900};
}
function getDimensions(p){
 const text=htmlToText(p.body_html||p.description||"");
 const find=(label)=>{
   const re=new RegExp("(?:"+label+")\\s*[:=\\-]?\\s*(\\d{2,4})\\s*(?:mm)?","i");
   const m=text.match(re); return m?Number(m[1]):null;
 };
 const w=find("bredd|width"), d=find("djup|depth"), h=find("höjd|hojd|height");
 if(w&&d) return {w,d,h:h||900,estimated:!h};
 const m=text.match(/(?:mått|dimensioner|dimensions?)?[^0-9]{0,20}(\d{2,4})\s*[x×]\s*(\d{2,4})\s*[x×]\s*(\d{2,4})\s*(?:mm)?/i);
 if(m) return {w:Number(m[1]),d:Number(m[2]),h:Number(m[3]),estimated:false};
 return {...fallbackDimensions(p),estimated:true};
}
function normalizeProduct(p){
 const v=(p.variants&&p.variants[0])||{}, dims=getDimensions(p);
 return {id:String(p.id),title:p.title||"Produkt",vendor:p.vendor||"",type:p.product_type||"Övrigt",price:Number(v.price||p.price||0),image:(p.images&&p.images[0]&&p.images[0].src)||(p.image&&p.image.src)||p.image||null,body_html:p.body_html||"",...dims};
}
function formatSEK(n){
 try{return Math.round(Number(n||0)).toLocaleString("sv-SE")+" kr";}catch{return Math.round(Number(n||0))+" kr";}
}
function rotatedSize(i){return i.rotation%180===0?{w:i.w,d:i.d}:{w:i.d,d:i.w};}
function overlaps(a,b){
 const A=rotatedSize(a),B=rotatedSize(b);
 return !(a.x+A.w<=b.x||b.x+B.w<=a.x||a.y+A.d<=b.y||b.y+B.d<=a.y);
}

function Splash(){
 return <View style={s.splash}>
   <View style={s.splashMark}><Text style={s.splashP}>P</Text></View>
   <Text style={s.splashTitle}>PAX STORKÖK</Text>
   <Text style={s.splashSub}>Köksplanerare</Text><View style={s.splashLine}/>
 </View>;
}

function DraggableItem({item,scale,selected,onSelect,onMoveEnd}){
 const sz=rotatedSize(item);
 const pan=useRef(new Animated.ValueXY({x:item.x*scale,y:item.y*scale})).current;
 useEffect(()=>{pan.setValue({x:item.x*scale,y:item.y*scale});},[item.x,item.y,item.rotation,scale]);
 const responder=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,
  onPanResponderGrant:()=>onSelect(item.instanceId),
  onPanResponderMove:(_,g)=>pan.setValue({x:item.x*scale+g.dx,y:item.y*scale+g.dy}),
  onPanResponderRelease:(_,g)=>onMoveEnd(item.instanceId,item.x+g.dx/scale,item.y+g.dy/scale)
 })).current;
 return <Animated.View {...responder.panHandlers} style={[s.placed,selected&&s.placedSelected,{width:Math.max(34,sz.w*scale),height:Math.max(28,sz.d*scale),transform:pan.getTranslateTransform()}]}>
  {item.image?<Image source={{uri:item.image}} style={s.placedImage} resizeMode="contain"/>:<Text style={s.placedLetter}>{(item.type||"P").slice(0,1).toUpperCase()}</Text>}
  <Text numberOfLines={1} style={s.placedName}>{item.title}</Text>
 </Animated.View>;
}

function ProductCard({p,onAdd}){
 return <View style={s.productCard}>
  <View style={s.productImageWrap}>{p.image?<Image source={{uri:p.image}} style={s.productImage} resizeMode="contain"/>:<Text style={s.productPlaceholder}>PAX</Text>}</View>
  <View style={s.productInfo}>
   <Text numberOfLines={2} style={s.productTitle}>{p.title}</Text>
   <Text numberOfLines={1} style={s.productMeta}>{p.w} × {p.d} × {p.h} mm{p.estimated?"  ~":""}</Text>
   <Text style={s.productPrice}>{formatSEK(p.price)}</Text>
  </View>
  <TouchableOpacity style={s.addBtn} onPress={()=>onAdd(p)}><Text style={s.addBtnText}>+</Text></TouchableOpacity>
 </View>;
}

function IsoBox({item,scale,ox,oy}){
 const q=rotatedSize(item), H=Math.min(item.h||900,2200);
 const iso=(x,y,z=0)=>({x:ox+(x-y)*scale*.72,y:oy+(x+y)*scale*.36-z*scale*.62});
 const p1=iso(item.x,item.y),p2=iso(item.x+q.w,item.y),p3=iso(item.x+q.w,item.y+q.d),p4=iso(item.x,item.y+q.d);
 const t1=iso(item.x,item.y,H),t2=iso(item.x+q.w,item.y,H),t3=iso(item.x+q.w,item.y+q.d,H),t4=iso(item.x,item.y+q.d,H);
 const pts=a=>a.map(p=>p.x+","+p.y).join(" ");
 const short=item.title.length>18?item.title.slice(0,16)+"…":item.title;
 return <>
  <Polygon points={pts([t1,t2,t3,t4])} fill="#DDE8F3" stroke="#6E8298" strokeWidth="1"/>
  <Polygon points={pts([t2,p2,p3,t3])} fill="#B8CADC" stroke="#6E8298" strokeWidth="1"/>
  <Polygon points={pts([t3,p3,p4,t4])} fill="#9FB4C9" stroke="#6E8298" strokeWidth="1"/>
  <SvgText x={(t1.x+t2.x+t3.x+t4.x)/4} y={(t1.y+t2.y+t3.y+t4.y)/4+3} fontSize="7" fill="#142236" textAnchor="middle">{short}</SvgText>
 </>;
}

function ThreeDView({roomW,roomD,placed}){
 const W=Math.max(roomW,1),D=Math.max(roomD,1),scale=Math.min(.05,280/Math.max(W+D,1)),ox=180,oy=85;
 const iso=(x,y,z=0)=>({x:ox+(x-y)*scale*.72,y:oy+(x+y)*scale*.36-z*scale*.62});
 const a=iso(0,0),b=iso(W,0),c=iso(W,D),d=iso(0,D),at=iso(0,0,2400),bt=iso(W,0,2400),dt=iso(0,D,2400);
 const pts=x=>x.map(p=>p.x+","+p.y).join(" ");
 return <View style={s.renderCard}>
  <View style={s.renderHeader}><View><Text style={s.renderTitle}>3D-render</Text><Text style={s.renderSub}>Automatiskt från din 2D-plan</Text></View><View style={s.renderBadge}><Text style={s.renderBadgeText}>LIVE</Text></View></View>
  <Svg width="100%" height="420" viewBox="0 0 360 420">
   <Polygon points={pts([a,b,c,d])} fill="#EEF2F6" stroke="#8D9AA8" strokeWidth="1.5"/>
   <Polygon points={pts([a,b,bt,at])} fill="#F8FAFC" stroke="#A6B1BD" strokeWidth="1"/>
   <Polygon points={pts([a,d,dt,at])} fill="#F3F6F9" stroke="#A6B1BD" strokeWidth="1"/>
   <Polyline points={pts([at,bt,b])} fill="none" stroke="#C3CBD4" strokeWidth="1"/>
   <Polyline points={pts([at,dt,d])} fill="none" stroke="#C3CBD4" strokeWidth="1"/>
   {[...placed].sort((x,y)=>(x.x+x.y)-(y.x+y.y)).map(i=><IsoBox key={i.instanceId} item={i} scale={scale} ox={ox} oy={oy}/>)}
   <SvgText x="180" y="395" fontSize="11" fill="#65758A" textAnchor="middle">{Math.round(roomW)} × {Math.round(roomD)} mm • {placed.length} produkter</SvgText>
  </Svg>
 </View>;
}

export default function App(){
 const [splash,setSplash]=useState(true),[tab,setTab]=useState("plan");
 const [roomW,setRoomW]=useState("6000"),[roomD,setRoomD]=useState("4500"),[roomH,setRoomH]=useState("2600");
 const [products,setProducts]=useState([]),[loading,setLoading]=useState(true),[catalogError,setCatalogError]=useState("");
 const [query,setQuery]=useState(""),[category,setCategory]=useState("Alla"),[placed,setPlaced]=useState([]),[selectedId,setSelectedId]=useState(null);

 useEffect(()=>{const t=setTimeout(()=>setSplash(false),1500);return()=>clearTimeout(t);},[]);

 async function loadProducts(){
  setLoading(true);setCatalogError("");
  try{
   const pages=await Promise.all([1,2,3].map(async page=>{
    const r=await fetch(SHOP_URL+"/products.json?limit=250&page="+page);
    if(!r.ok) throw new Error("HTTP "+r.status);
    const j=await r.json();return Array.isArray(j.products)?j.products:[];
   }));
   const all=pages.flat(),unique=Array.from(new Map(all.map(p=>[String(p.id),p])).values());
   if(!unique.length) throw new Error("Tom katalog");
   setProducts(unique.map(normalizeProduct));
  }catch(e){
   setCatalogError("Kunde inte läsa live-katalogen. Visar reservprodukter.");
   setProducts(FALLBACK_PRODUCTS.map(normalizeProduct));
  }finally{setLoading(false);}
 }
 useEffect(()=>{loadProducts();},[]);

 const wmm=Math.max(2000,Number(roomW)||6000),dmm=Math.max(2000,Number(roomD)||4500),hmm=Math.max(2000,Number(roomH)||2600);
 const scale=Math.min(342/wmm,420/dmm),canvasW=wmm*scale,canvasH=dmm*scale;
 const categories=useMemo(()=>["Alla",...Array.from(new Set(products.map(p=>p.type).filter(Boolean))).slice(0,14)],[products]);
 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase();
  return products.filter(p=>(category==="Alla"||p.type===category)&&(!q||((p.title+" "+p.vendor+" "+p.type).toLowerCase().includes(q)))).slice(0,80);
 },[products,query,category]);

 function addProduct(p){
  const instanceId=String(p.id)+"-"+Date.now()+"-"+Math.random(),row=placed.length%5,col=Math.floor(placed.length/5);
  const x=Math.min(150+row*750,Math.max(0,wmm-p.w)),y=Math.min(150+col*850,Math.max(0,dmm-p.d));
  setPlaced(v=>[...v,{...p,instanceId,x,y,rotation:0}]);setSelectedId(instanceId);
 }
 function moveItem(id,nx,ny){
  setPlaced(prev=>prev.map(item=>{
   if(item.instanceId!==id)return item;
   const z=rotatedSize(item);let x=Math.max(0,Math.min(nx,wmm-z.w)),y=Math.max(0,Math.min(ny,dmm-z.d)),snap=130;
   if(x<snap)x=0;if(y<snap)y=0;if(wmm-(x+z.w)<snap)x=wmm-z.w;if(dmm-(y+z.d)<snap)y=dmm-z.d;
   const candidate={...item,x,y},collision=prev.some(o=>o.instanceId!==id&&overlaps(candidate,o));
   return collision?item:candidate;
  }));
 }
 function rotateSelected(){
  if(!selectedId)return;
  setPlaced(prev=>prev.map(item=>{
   if(item.instanceId!==selectedId)return item;
   const c={...item,rotation:(item.rotation+90)%360},z=rotatedSize(c);
   c.x=Math.min(c.x,Math.max(0,wmm-z.w));c.y=Math.min(c.y,Math.max(0,dmm-z.d));
   return prev.some(o=>o.instanceId!==selectedId&&overlaps(c,o))?item:c;
  }));
 }
 function deleteSelected(){if(selectedId){setPlaced(v=>v.filter(x=>x.instanceId!==selectedId));setSelectedId(null);}}
 function duplicateSelected(){
  const src=placed.find(x=>x.instanceId===selectedId);if(!src)return;
  const z=rotatedSize(src),copy={...src,instanceId:String(src.id)+"-"+Date.now()+"-copy",x:Math.min(src.x+180,Math.max(0,wmm-z.w)),y:Math.min(src.y+180,Math.max(0,dmm-z.d))};
  setPlaced(v=>[...v,copy]);setSelectedId(copy.instanceId);
 }
 const totalPrice=placed.reduce((sum,p)=>sum+Number(p.price||0),0);
 if(splash)return <Splash/>;

 return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content" backgroundColor={BG}/><View style={s.app}>
  <View style={s.header}><View style={s.brandRow}><View style={s.smallLogo}><Text style={s.smallLogoText}>P</Text></View><View><Text style={s.brand}>PAX <Text style={s.brandLight}>Köksplanerare</Text></Text><Text style={s.headerSub}>PAX STORKÖK AB • Shopify live</Text></View></View><View style={s.onlineDot}/></View>
  <View style={s.tabs}>{[["plan","2D Plan"],["3d","3D"],["list","Lista"]].map(x=><TouchableOpacity key={x[0]} onPress={()=>setTab(x[0])} style={[s.tab,tab===x[0]&&s.tabActive]}><Text style={[s.tabText,tab===x[0]&&s.tabTextActive]}>{x[1]}</Text></TouchableOpacity>)}</View>
  <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
   <View style={s.roomCard}><Text style={s.sectionTitle}>Lokalens mått</Text><View style={s.dimRow}>
    {[["Bredd",roomW,setRoomW],["Djup",roomD,setRoomD],["Höjd",roomH,setRoomH]].map(x=><View style={s.dimField} key={x[0]}><Text style={s.dimLabel}>{x[0]}</Text><TextInput value={x[1]} onChangeText={x[2]} keyboardType="number-pad" style={s.dimInput}/><Text style={s.mm}>mm</Text></View>)}
   </View></View>

   {tab==="plan"&&<>
    <View style={s.planTopRow}><View style={{flex:1}}><Text style={s.sectionTitle}>Placera utrustning</Text><Text style={s.sectionSub}>Dra produkterna. De snappar mot vägg och kan inte överlappa.</Text></View><View style={s.countPill}><Text style={s.countText}>{placed.length}</Text></View></View>
    <View style={s.canvasCard}><Text style={s.measureTop}>{Math.round(wmm)} mm</Text><View style={[s.room,{width:canvasW,height:canvasH}]}>
     <View style={s.doorGap}><View style={s.doorLeaf}/></View>
     {placed.map(i=><DraggableItem key={i.instanceId} item={i} scale={scale} selected={selectedId===i.instanceId} onSelect={setSelectedId} onMoveEnd={moveItem}/>)}
    </View><Text style={s.measureBottom}>{Math.round(dmm)} mm djup</Text></View>
    {selectedId&&<View style={s.editBar}><TouchableOpacity style={s.editBtn} onPress={rotateSelected}><Text style={s.editBtnText}>↻ Rotera 90°</Text></TouchableOpacity><TouchableOpacity style={s.editBtn} onPress={duplicateSelected}><Text style={s.editBtnText}>⧉ Duplicera</Text></TouchableOpacity><TouchableOpacity style={[s.editBtn,s.deleteBtn]} onPress={deleteSelected}><Text style={[s.editBtnText,s.deleteText]}>Ta bort</Text></TouchableOpacity></View>}
    <View style={s.catalogHead}><View><Text style={s.sectionTitle}>Shopify-produkter</Text><Text style={s.sectionSub}>{products.length} produkter laddade i appen</Text></View><TouchableOpacity onPress={loadProducts} style={s.reloadBtn}><Text style={s.reloadText}>Uppdatera</Text></TouchableOpacity></View>
    <TextInput value={query} onChangeText={setQuery} placeholder="Sök produkt, märke eller kategori..." placeholderTextColor="#8B98A8" style={s.search}/>
    {!!catalogError&&<Text style={s.warning}>{catalogError}</Text>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>{categories.map(c=><TouchableOpacity key={c} onPress={()=>setCategory(c)} style={[s.category,category===c&&s.categoryActive]}><Text style={[s.categoryText,category===c&&s.categoryTextActive]}>{c}</Text></TouchableOpacity>)}</ScrollView>
    {loading?<View style={s.loader}><ActivityIndicator size="large" color={BLUE}/><Text style={s.loaderText}>Hämtar produkter från Shopify...</Text></View>:<View>{filtered.map(p=><ProductCard key={p.id} p={p} onAdd={addProduct}/>)}{!filtered.length&&<Text style={s.empty}>Inga produkter hittades.</Text>}</View>}
   </>}

   {tab==="3d"&&<><ThreeDView roomW={wmm} roomD={dmm} roomH={hmm} placed={placed}/><View style={s.infoCard}><Text style={s.infoTitle}>Så fungerar 3D-vyn</Text><Text style={s.infoText}>Produkternas position, rotation, bredd, djup och höjd kommer direkt från 2D-planen. Produkter med “~” använder tillfälliga standardmått tills exakta Shopify-mått finns.</Text><TouchableOpacity style={s.primaryBtn} onPress={()=>setTab("plan")}><Text style={s.primaryBtnText}>Tillbaka till 2D-plan</Text></TouchableOpacity></View></>}

   {tab==="list"&&<View><Text style={s.sectionTitle}>Projektöversikt</Text><Text style={s.sectionSub}>{placed.length} produkter • uppskattat listpris {formatSEK(totalPrice)}</Text><View style={s.summaryCard}>
    {!placed.length?<Text style={s.empty}>Inga produkter har placerats ännu.</Text>:placed.map((p,i)=><View key={p.instanceId} style={s.summaryRow}><Text style={s.summaryIndex}>{i+1}</Text><View style={{flex:1}}><Text numberOfLines={1} style={s.summaryName}>{p.title}</Text><Text style={s.summaryMeta}>{p.w} × {p.d} × {p.h} mm • {p.rotation}°</Text></View><Text style={s.summaryPrice}>{formatSEK(p.price)}</Text></View>)}
   </View><View style={s.quoteCard}><Text style={s.quoteTitle}>Klar för offert</Text><Text style={s.quoteText}>Nästa steg är att koppla projektet till PAX offertflöde så kunden kan skicka ritning, produktlista och kontaktuppgifter direkt till er.</Text><TouchableOpacity style={s.primaryBtn}><Text style={s.primaryBtnText}>Begär offert</Text></TouchableOpacity></View></View>}
  </ScrollView>
 </View></SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:BG,paddingTop:StatusBar.currentHeight||0},app:{flex:1,backgroundColor:BG},scroll:{padding:16,paddingBottom:50},
 header:{paddingHorizontal:16,paddingTop:12,paddingBottom:12,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},brandRow:{flexDirection:"row",alignItems:"center",gap:10},
 smallLogo:{width:42,height:42,borderRadius:13,backgroundColor:BLUE,alignItems:"center",justifyContent:"center"},smallLogoText:{color:"#fff",fontWeight:"900",fontSize:23},brand:{fontSize:22,fontWeight:"900",color:NAVY},brandLight:{fontWeight:"400",color:"#6F7D90"},headerSub:{fontSize:11,color:"#8693A3",marginTop:2},onlineDot:{width:10,height:10,borderRadius:5,backgroundColor:"#2BB673"},
 tabs:{marginHorizontal:16,backgroundColor:"#E8EDF3",borderRadius:14,padding:4,flexDirection:"row"},tab:{flex:1,paddingVertical:10,alignItems:"center",borderRadius:11},tabActive:{backgroundColor:"#fff"},tabText:{fontWeight:"700",color:"#718096"},tabTextActive:{color:NAVY},
 roomCard:{backgroundColor:"#fff",borderRadius:18,borderWidth:1,borderColor:BORDER,padding:14,marginBottom:16},sectionTitle:{fontSize:21,fontWeight:"900",color:NAVY},sectionSub:{fontSize:12,color:"#748397",marginTop:3,lineHeight:17},dimRow:{flexDirection:"row",gap:8,marginTop:12},dimField:{flex:1,backgroundColor:"#F8FAFC",borderWidth:1,borderColor:BORDER,borderRadius:13,padding:9},dimLabel:{fontSize:11,color:"#7D8B9D"},dimInput:{fontSize:18,fontWeight:"800",color:NAVY,paddingVertical:3},mm:{fontSize:10,color:"#9AA5B2"},
 planTopRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:10},countPill:{minWidth:38,height:38,borderRadius:19,backgroundColor:"#E8F3FD",alignItems:"center",justifyContent:"center"},countText:{color:BLUE,fontWeight:"900"},canvasCard:{backgroundColor:"#fff",borderWidth:1,borderColor:BORDER,borderRadius:19,paddingVertical:14,alignItems:"center"},measureTop:{fontSize:12,color:"#6F7D90",marginBottom:7},measureBottom:{fontSize:12,color:"#6F7D90",marginTop:7},room:{position:"relative",backgroundColor:"#FAFBFC",borderWidth:5,borderColor:"#303A46",overflow:"hidden"},
 doorGap:{position:"absolute",bottom:-6,right:"16%",width:56,height:35,backgroundColor:"#FAFBFC",zIndex:1,borderTopWidth:1,borderLeftWidth:1,borderColor:"#A5AFBA"},doorLeaf:{width:42,height:1,backgroundColor:"#A5AFBA",transform:[{rotate:"-45deg"},{translateY:14}]},
 placed:{position:"absolute",backgroundColor:"#E1E7EE",borderColor:"#9AA8B7",borderWidth:1,borderRadius:5,alignItems:"center",justifyContent:"center",padding:2,zIndex:4},placedSelected:{borderWidth:2,borderColor:BLUE,backgroundColor:"#EDF6FE"},placedImage:{width:"72%",height:"60%"},placedLetter:{fontSize:14,fontWeight:"900",color:NAVY},placedName:{fontSize:7,fontWeight:"700",color:"#2D3A4A",width:"95%",textAlign:"center"},
 editBar:{marginTop:10,flexDirection:"row",gap:8},editBtn:{flex:1,backgroundColor:"#fff",borderWidth:1,borderColor:BORDER,borderRadius:12,paddingVertical:11,alignItems:"center"},editBtnText:{fontSize:12,fontWeight:"800",color:"#344359"},deleteBtn:{backgroundColor:"#FFF6F6",borderColor:"#F1C7C7"},deleteText:{color:"#C83C3C"},
 catalogHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:22},reloadBtn:{paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:"#E9F3FD"},reloadText:{color:BLUE,fontWeight:"800",fontSize:12},search:{marginTop:12,backgroundColor:"#fff",borderWidth:1,borderColor:BORDER,borderRadius:14,paddingHorizontal:14,paddingVertical:13,color:NAVY,fontSize:15},warning:{marginTop:8,color:"#B36B00",fontSize:12},categoryRow:{gap:8,paddingVertical:12,paddingRight:20},category:{backgroundColor:"#fff",borderWidth:1,borderColor:BORDER,borderRadius:13,paddingHorizontal:14,paddingVertical:9},categoryActive:{backgroundColor:BLUE,borderColor:BLUE},categoryText:{fontSize:12,fontWeight:"700",color:"#46566B"},categoryTextActive:{color:"#fff"},
 loader:{paddingVertical:45,alignItems:"center"},loaderText:{marginTop:10,color:"#718096"},productCard:{backgroundColor:"#fff",borderWidth:1,borderColor:BORDER,borderRadius:16,padding:10,marginBottom:9,flexDirection:"row",alignItems:"center"},productImageWrap:{width:70,height:70,borderRadius:12,backgroundColor:"#F3F6F9",alignItems:"center",justifyContent:"center",overflow:"hidden"},productImage:{width:"92%",height:"92%"},productPlaceholder:{fontWeight:"900",color:"#9AA7B6"},productInfo:{flex:1,paddingHorizontal:11},productTitle:{fontSize:14,fontWeight:"800",color:NAVY,lineHeight:18},productMeta:{fontSize:11,color:"#748397",marginTop:4},productPrice:{fontSize:12,fontWeight:"800",color:"#2F6A46",marginTop:3},addBtn:{width:42,height:42,borderRadius:21,backgroundColor:"#E6F2FD",alignItems:"center",justifyContent:"center"},addBtnText:{fontSize:27,color:BLUE,lineHeight:29},empty:{paddingVertical:24,textAlign:"center",color:"#7E8A99"},
 renderCard:{backgroundColor:"#fff",borderWidth:1,borderColor:BORDER,borderRadius:19,overflow:"hidden"},renderHeader:{padding:16,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},renderTitle:{fontSize:22,fontWeight:"900",color:NAVY},renderSub:{fontSize:12,color:"#748397",marginTop:2},renderBadge:{backgroundColor:"#E6F7EE",borderRadius:9,paddingHorizontal:9,paddingVertical:5},renderBadgeText:{fontSize:10,fontWeight:"900",color:"#228954"},infoCard:{marginTop:14,backgroundColor:"#fff",borderRadius:17,borderWidth:1,borderColor:BORDER,padding:16},infoTitle:{fontSize:16,fontWeight:"900",color:NAVY},infoText:{fontSize:13,lineHeight:20,color:"#64748B",marginTop:7},primaryBtn:{marginTop:14,backgroundColor:BLUE,borderRadius:14,paddingVertical:14,alignItems:"center"},primaryBtnText:{color:"#fff",fontWeight:"900",fontSize:15},
 summaryCard:{marginTop:14,backgroundColor:"#fff",borderWidth:1,borderColor:BORDER,borderRadius:18,padding:8},summaryRow:{flexDirection:"row",alignItems:"center",gap:10,padding:10,borderBottomWidth:1,borderBottomColor:"#EEF1F4"},summaryIndex:{width:26,height:26,borderRadius:13,backgroundColor:"#EDF3F8",textAlign:"center",textAlignVertical:"center",fontWeight:"800",color:"#506176"},summaryName:{fontSize:13,fontWeight:"800",color:NAVY},summaryMeta:{fontSize:10,color:"#8290A1",marginTop:2},summaryPrice:{fontSize:11,fontWeight:"800",color:"#2F6A46"},quoteCard:{marginTop:16,backgroundColor:"#0D1A2A",borderRadius:18,padding:18},quoteTitle:{color:"#fff",fontSize:20,fontWeight:"900"},quoteText:{color:"#BFC9D5",fontSize:13,lineHeight:19,marginTop:6},
 splash:{flex:1,backgroundColor:"#091422",alignItems:"center",justifyContent:"center"},splashMark:{width:98,height:98,borderRadius:28,backgroundColor:BLUE,alignItems:"center",justifyContent:"center"},splashP:{fontSize:56,fontWeight:"900",color:"#fff"},splashTitle:{marginTop:22,color:"#fff",fontSize:27,fontWeight:"900",letterSpacing:1.2},splashSub:{marginTop:5,color:"#9EB1C6",fontSize:15,letterSpacing:.4},splashLine:{marginTop:24,width:56,height:3,borderRadius:2,backgroundColor:BLUE}
});
