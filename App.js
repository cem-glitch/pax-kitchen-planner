import React, {useMemo,useRef,useState} from "react";
import {SafeAreaView,View,Text,TextInput,TouchableOpacity,ScrollView,StyleSheet,PanResponder,Animated} from "react-native";

const PRODUCTS=[
{id:"kyl600",name:"Kylskåp 600",category:"Kyla",w:600,d:700,icon:"❄"},
{id:"disk1200",name:"Diskbänk 1200",category:"Disk",w:1200,d:700,icon:"D"},
{id:"arb1200",name:"Arbetsbänk 1200",category:"Förvaring",w:1200,d:700,icon:"A"},
{id:"ugn600",name:"Ugn 600",category:"Matlagning",w:600,d:700,icon:"U"}
];
const CATEGORIES=["Kyla","Disk","Matlagning","Förvaring"];

function Draggable({item,roomW,roomH,scale}){
 const pw=Math.max(44,item.w*scale), ph=Math.max(38,item.d*scale);
 const start=useRef({x:Math.max(0,Math.min(16+(item.index%3)*60,roomW-pw)),y:Math.max(0,Math.min(16+Math.floor(item.index/3)*65,roomH-ph))}).current;
 const pos=useRef(new Animated.ValueXY(start)).current;
 const last=useRef(start);
 const pan=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,
  onPanResponderGrant:()=>{pos.setOffset(last.current);pos.setValue({x:0,y:0});},
  onPanResponderMove:Animated.event([null,{dx:pos.x,dy:pos.y}],{useNativeDriver:false}),
  onPanResponderRelease:(_,g)=>{
   const x=Math.max(0,Math.min(last.current.x+g.dx,roomW-pw));
   const y=Math.max(0,Math.min(last.current.y+g.dy,roomH-ph));
   last.current={x,y};pos.flattenOffset();pos.setValue({x,y});
  }
 })).current;
 return <Animated.View {...pan.panHandlers} style={[s.placed,{width:pw,height:ph,transform:pos.getTranslateTransform()}]}>
  <Text style={s.placedIcon}>{item.icon}</Text><Text numberOfLines={2} style={s.placedText}>{item.name}</Text>
 </Animated.View>;
}

export default function App(){
 const [rw,setRw]=useState("4250"),[rd,setRd]=useState("3200"),[cat,setCat]=useState("Kyla"),[placed,setPlaced]=useState([]);
 const w=Math.max(2500,Number(rw)||4250), d=Math.max(2000,Number(rd)||3200);
 const scale=Math.min(330/w,390/d), roomW=w*scale, roomH=d*scale;
 const filtered=useMemo(()=>PRODUCTS.filter(p=>p.category===cat),[cat]);
 const add=p=>setPlaced(v=>[...v,{...p,index:v.length,key:p.id+"-"+Date.now()}]);
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <View style={s.head}><View><Text style={s.brand}>PAX <Text style={s.light}>Köksplanerare</Text></Text><Text style={s.sub}>Skapa ditt kök på några minuter</Text></View><View style={s.logo}><Text style={s.logoT}>P</Text></View></View>
  <Text style={s.title}>1. Ange kökets mått</Text>
  <View style={s.row}>
   <View style={s.field}><Text style={s.label}>Bredd (mm)</Text><TextInput keyboardType="number-pad" value={rw} onChangeText={setRw} style={s.input}/></View>
   <View style={s.field}><Text style={s.label}>Djup (mm)</Text><TextInput keyboardType="number-pad" value={rd} onChangeText={setRd} style={s.input}/></View>
  </View>
  <Text style={s.title}>2. Placera produkter</Text>
  <View style={s.card}><Text style={s.dim}>{w} mm</Text><View style={[s.room,{width:roomW,height:roomH}]}>
   {placed.map(x=><Draggable key={x.key} item={x} roomW={roomW} roomH={roomH} scale={scale}/>)}
  </View><Text style={s.dim}>{d} mm djup • {placed.length} produkter</Text></View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cats}>{CATEGORIES.map(c=><TouchableOpacity key={c} onPress={()=>setCat(c)} style={[s.pill,cat===c&&s.pillOn]}><Text style={[s.pillT,cat===c&&s.pillTOn]}>{c}</Text></TouchableOpacity>)}</ScrollView>
  {filtered.map(p=><View key={p.id} style={s.product}><View style={s.productIcon}><Text style={s.big}>{p.icon}</Text></View><View style={{flex:1}}><Text style={s.productName}>{p.name}</Text><Text style={s.productSize}>{p.w} × {p.d} mm</Text></View><TouchableOpacity style={s.add} onPress={()=>add(p)}><Text style={s.addT}>+</Text></TouchableOpacity></View>)}
  <TouchableOpacity style={s.cta}><Text style={s.ctaT}>Gå till sammanfattning ({placed.length})</Text><Text style={s.ctaT}>›</Text></TouchableOpacity>
  <Text style={s.tip}>Tryck + för att lägga till en produkt och dra den sedan med fingret i ritningen.</Text>
 </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
safe:{flex:1,backgroundColor:"#F6F8FB"},page:{padding:18,paddingBottom:42},
head:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:22},
brand:{fontSize:27,fontWeight:"800",color:"#0C1B33"},light:{fontWeight:"400",color:"#718096"},sub:{color:"#718096",marginTop:3},
logo:{width:46,height:46,borderRadius:14,backgroundColor:"#1479D2",alignItems:"center",justifyContent:"center"},logoT:{color:"#fff",fontWeight:"900",fontSize:23},
title:{fontSize:21,fontWeight:"800",color:"#111C2E",marginTop:8,marginBottom:10},row:{flexDirection:"row",gap:10},
field:{flex:1,backgroundColor:"#fff",borderWidth:1,borderColor:"#DDE5EE",borderRadius:15,padding:12},label:{fontSize:12,color:"#738197"},input:{fontSize:21,fontWeight:"800",color:"#111C2E",paddingVertical:4},
card:{backgroundColor:"#fff",borderWidth:1,borderColor:"#DDE5EE",borderRadius:18,padding:14,alignItems:"center"},
dim:{fontSize:12,color:"#68778C",marginVertical:7},room:{borderWidth:6,borderColor:"#303946",backgroundColor:"#FAFBFD",position:"relative",overflow:"hidden"},
placed:{position:"absolute",backgroundColor:"#D8DEE6",borderWidth:1,borderColor:"#98A2AE",borderRadius:6,alignItems:"center",justifyContent:"center",padding:2},
placedIcon:{fontSize:15,fontWeight:"800"},placedText:{fontSize:8,fontWeight:"700",textAlign:"center",color:"#263445"},
cats:{gap:8,paddingVertical:14},pill:{paddingHorizontal:15,paddingVertical:10,borderRadius:14,borderWidth:1,borderColor:"#DDE5EE",backgroundColor:"#fff"},
pillOn:{backgroundColor:"#1479D2",borderColor:"#1479D2"},pillT:{fontWeight:"700",color:"#344359"},pillTOn:{color:"#fff"},
product:{flexDirection:"row",alignItems:"center",gap:12,backgroundColor:"#fff",borderWidth:1,borderColor:"#DDE5EE",borderRadius:15,padding:11,marginBottom:9},
productIcon:{width:52,height:52,borderRadius:13,backgroundColor:"#EEF5FC",alignItems:"center",justifyContent:"center"},big:{fontSize:22,fontWeight:"800"},
productName:{fontSize:16,fontWeight:"800",color:"#152238"},productSize:{fontSize:12,color:"#7B8799",marginTop:3},
add:{width:42,height:42,borderRadius:21,backgroundColor:"#E4F0FC",alignItems:"center",justifyContent:"center"},addT:{fontSize:27,color:"#1479D2"},
cta:{marginTop:10,backgroundColor:"#1479D2",borderRadius:16,padding:17,flexDirection:"row",justifyContent:"space-between"},ctaT:{color:"#fff",fontWeight:"800",fontSize:16},
tip:{textAlign:"center",color:"#7D899B",fontSize:12,lineHeight:18,marginTop:13}
});