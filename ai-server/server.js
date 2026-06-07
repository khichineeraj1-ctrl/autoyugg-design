/**
 * Auto Portal — AI Assistant API Server (Enhanced)
 * Handles: budget, features, ORP, comparisons, variant advice, use-cases, safety, transmission
 *
 * POST /api/chat  { message, history }
 * → { reply, vehicles, orpData, comparisonData, variantAdvice, followUps, queryType }
 */

'use strict';

const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');

const PORT    = process.env.PORT || 3001;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL   = 'claude-haiku-4-5-20251001';

if (!API_KEY) { console.error('[ERROR] ANTHROPIC_API_KEY not set'); process.exit(1); }

const anthropic = new Anthropic({ apiKey: API_KEY });

/* ═══════════════════════════════════════════════════════════
   CITY ON-ROAD PRICE CONFIG
   road_tax_pct: % of ex-showroom (cars < ₹10L use lower bracket)
   orp = ex-showroom + road_tax + reg_fee + insurance (~3%) + handling
   ═══════════════════════════════════════════════════════════ */
const CITIES = {
  mumbai:    { name:'Mumbai',    state:'Maharashtra', road_tax:0.09, reg_fee:600,  ev_exempt:false },
  delhi:     { name:'Delhi',     state:'Delhi',       road_tax:0.07, reg_fee:600,  ev_exempt:true  },
  bangalore: { name:'Bangalore', state:'Karnataka',   road_tax:0.13, reg_fee:600,  ev_exempt:true  },
  hyderabad: { name:'Hyderabad', state:'Telangana',   road_tax:0.12, reg_fee:600,  ev_exempt:true  },
  chennai:   { name:'Chennai',   state:'Tamil Nadu',  road_tax:0.10, reg_fee:600,  ev_exempt:true  },
  pune:      { name:'Pune',      state:'Maharashtra', road_tax:0.09, reg_fee:600,  ev_exempt:false },
  kolkata:   { name:'Kolkata',   state:'West Bengal', road_tax:0.06, reg_fee:600,  ev_exempt:false },
  ahmedabad: { name:'Ahmedabad', state:'Gujarat',     road_tax:0.06, reg_fee:600,  ev_exempt:true  },
  jaipur:    { name:'Jaipur',    state:'Rajasthan',   road_tax:0.06, reg_fee:600,  ev_exempt:false },
  lucknow:   { name:'Lucknow',   state:'Uttar Pradesh',road_tax:0.08,reg_fee:600, ev_exempt:true  },
};

function calcORP(exShowroom, cityKey, fuelType) {
  const city = CITIES[cityKey];
  if (!city) return null;
  const isEV = fuelType === 'Electric';
  const roadTaxRate = (isEV && city.ev_exempt) ? 0 : city.road_tax;
  const roadTax  = Math.round(exShowroom * roadTaxRate);
  const regFee   = city.reg_fee;
  const insurance= Math.round(exShowroom * 0.03);
  const handling = 8000;
  const tcs      = exShowroom > 1000000 ? Math.round(exShowroom * 0.01) : 0;
  const total    = exShowroom + roadTax + regFee + insurance + handling + tcs;
  return {
    city: city.name,
    state: city.state,
    exShowroom,
    roadTax,
    roadTaxRate: roadTaxRate * 100,
    evExempt: isEV && city.ev_exempt,
    regFee,
    insurance,
    handling,
    tcs,
    total,
  };
}

/* ═══════════════════════════════════════════════════════════
   VEHICLE DATABASE
   ═══════════════════════════════════════════════════════════ */
const VEHICLES = [
  // ── CARS ──────────────────────────────────────────────────────────────────────────────────
  {
    id:'maruti-swift', name:'Maruti Suzuki Swift', brand:'Maruti Suzuki', type:'car',
    body:'Hatchback', fuel:'Petrol', seats:5,
    priceMin:649000, priceMax:964000, mileage:23.76, rating:4.2, ncap:null,
    transmission:['manual','automatic'],
    features:['touchscreen','rearCamera','dualAirbags','abs'],
    variants:[
      {name:'LXi',   price:649000,  key:'Entry level'},
      {name:'VXi',   price:740000,  key:'Mid — most popular'},
      {name:'ZXi',   price:845000,  key:'Smart Hybrid, sunroof'},
      {name:'ZXi+',  price:964000,  key:'Top — all features'},
    ],
    useCases:['city','daily commute','youngsters','first car'],
    highlights:['Best-in-class mileage','Lightest in segment','Easy to park'],
    tags:['affordable','city','youngsters','first car','hatchback'],
  },
  {
    id:'maruti-baleno', name:'Maruti Suzuki Baleno', brand:'Maruti Suzuki', type:'car',
    body:'Hatchback', fuel:'Petrol', seats:5,
    priceMin:666000, priceMax:969000, mileage:22.35, rating:4.2, ncap:null,
    transmission:['manual','automatic'],
    features:['touchscreen','rearCamera','360camera','headUpDisplay','6airbags'],
    variants:[
      {name:'Sigma',  price:666000,  key:'Entry'},
      {name:'Delta',  price:750000,  key:'Mid'},
      {name:'Zeta',   price:860000,  key:'HUD, 360 camera'},
      {name:'Alpha',  price:969000,  key:'Top'},
    ],
    useCases:['city','daily commute','premium hatchback'],
    highlights:['Head-up display','360 camera','Large boot (318L)'],
    tags:['premium hatchback','feature packed','city'],
  },
  {
    id:'maruti-brezza', name:'Maruti Suzuki Brezza', brand:'Maruti Suzuki', type:'car',
    body:'Compact SUV', fuel:'Petrol', seats:5,
    priceMin:834000, priceMax:1414000, mileage:19.89, rating:4.3, ncap:null,
    transmission:['manual','automatic'],
    features:['touchscreen','rearCamera','sunroof','6airbags','connectedCar','headUpDisplay'],
    variants:[
      {name:'LXi',    price:834000,  key:'Base'},
      {name:'VXi',    price:997000,  key:'Popular mid'},
      {name:'ZXi',    price:1160000, key:'Sunroof, HUD'},
      {name:'ZXi+',   price:1414000, key:'Top, all features'},
    ],
    useCases:['city','family','daily commute'],
    highlights:['Most affordable SUV with HUD','Strong resale value'],
    tags:['compact suv','popular','affordable suv'],
  },
  {
    id:'maruti-ertiga', name:'Maruti Suzuki Ertiga', brand:'Maruti Suzuki', type:'car',
    body:'MPV', fuel:'Petrol', seats:7,
    priceMin:895000, priceMax:1320000, mileage:20.30, rating:4.3, ncap:null,
    transmission:['manual','automatic'],
    features:['touchscreen','rearCamera','6airbags','thirdRowSeating'],
    variants:[
      {name:'VXi',   price:895000,  key:'Mid — best value'},
      {name:'ZXi',   price:1100000, key:'Smart Hybrid'},
      {name:'ZXi+',  price:1320000, key:'Top, Auto'},
    ],
    useCases:['family','7 seater','daily commute','outstation'],
    highlights:['Most affordable 7-seater','Comfortable 3rd row','Smart Hybrid'],
    tags:['7 seater','family','mpv','affordable 7 seater'],
  },
  {
    id:'maruti-grand-vitara', name:'Maruti Suzuki Grand Vitara', brand:'Maruti Suzuki', type:'car',
    body:'SUV', fuel:'Hybrid', seats:5,
    priceMin:1072000, priceMax:2013000, mileage:27.97, rating:4.4, ncap:null,
    transmission:['manual','automatic'],
    features:['panoramicSunroof','touchscreen','360camera','headUpDisplay','ventilatedSeats','6airbags','connectedCar','strongHybrid'],
    variants:[
      {name:'Sigma',        price:1072000, key:'Base'},
      {name:'Delta',        price:1204000, key:'Mid'},
      {name:'Zeta',         price:1381000, key:'Panoramic sunroof'},
      {name:'Alpha',        price:1562000, key:'Strong Hybrid'},
      {name:'Alpha+ AWD',   price:2013000, key:'Top AWD Hybrid'},
    ],
    useCases:['highway','family','eco-conscious','long drives'],
    highlights:['Best mileage SUV','Strong Hybrid option','Panoramic sunroof across variants'],
    tags:['suv','hybrid','mileage king','panoramic sunroof','eco'],
  },
  {
    id:'hyundai-creta', name:'Hyundai Creta', brand:'Hyundai', type:'car',
    body:'SUV', fuel:'Petrol', seats:5,
    priceMin:1111000, priceMax:2014000, mileage:17.40, rating:4.4, ncap:5,
    transmission:['manual','automatic'],
    features:['panoramicSunroof','touchscreen','360camera','ventilatedSeats','adas','6airbags','connectedCar','bose','wirelessCharging'],
    variants:[
      {name:'E',       price:1111000, key:'Base'},
      {name:'EX',      price:1248000, key:'Good features'},
      {name:'S',       price:1410000, key:'Sunroof added'},
      {name:'SX',      price:1670000, key:'Turbo, ADAS'},
      {name:'SX(O)',   price:2014000, key:'Top — panoramic, Bose, ventilated'},
    ],
    useCases:['family','highway','city','premium'],
    highlights:['5-star NCAP','ADAS Level 2','Panoramic sunroof','Bose sound system'],
    tags:['suv','bestseller','5 star ncap','adas','panoramic sunroof','premium'],
  },
  {
    id:'hyundai-creta-ev', name:'Hyundai Creta Electric', brand:'Hyundai', type:'car',
    body:'SUV', fuel:'Electric', seats:5,
    priceMin:1799000, priceMax:2399000, range:473, rating:4.4, ncap:5,
    transmission:['automatic'],
    features:['panoramicSunroof','touchscreen','360camera','ventilatedSeats','adas','v2l','6airbags','connectedCar','bose','wirelessCharging','digitalSideCamera'],
    variants:[
      {name:'Smart',     price:1799000, key:'Base EV, 42 kWh'},
      {name:'Smart+',    price:1849000, key:'More features'},
      {name:'Executive', price:2049000, key:'51.4 kWh, 473 km'},
      {name:'Excellence',price:2399000, key:'Top — V2L, panoramic'},
    ],
    useCases:['electric','long range','premium','family','highway'],
    highlights:['V2L (power external devices)','473 km range','5-star NCAP','Digital side cameras'],
    tags:['electric','suv','long range','v2l','panoramic sunroof','5 star ncap'],
  },
  {
    id:'hyundai-venue', name:'Hyundai Venue', brand:'Hyundai', type:'car',
    body:'Compact SUV', fuel:'Petrol', seats:5,
    priceMin:755000, priceMax:1330000, mileage:18.15, rating:4.2, ncap:null,
    transmission:['manual','automatic'],
    features:['touchscreen','rearCamera','sunroof','6airbags','connectedCar'],
    variants:[
      {name:'E',    price:755000,  key:'Entry'},
      {name:'S',    price:948000,  key:'Sunroof'},
      {name:'SX',   price:1185000, key:'Full features'},
      {name:'SX+',  price:1330000, key:'Top'},
    ],
    useCases:['city','first suv','affordable suv'],
    highlights:['Connected car features','Compact and agile in city'],
    tags:['compact suv','city','affordable suv','connected car'],
  },
  {
    id:'hyundai-verna', name:'Hyundai Verna', brand:'Hyundai', type:'car',
    body:'Sedan', fuel:'Petrol', seats:5,
    priceMin:1099000, priceMax:1765000, mileage:20.60, rating:4.3, ncap:null,
    transmission:['manual','automatic'],
    features:['panoramicSunroof','touchscreen','360camera','ventilatedSeats','adas','6airbags','bose','wirelessCharging'],
    variants:[
      {name:'E',     price:1099000, key:'Base'},
      {name:'EX',    price:1249000, key:'Mid'},
      {name:'S',     price:1394000, key:'Good value'},
      {name:'SX(O)', price:1765000, key:'Top — panoramic, Bose, ADAS'},
    ],
    useCases:['highway','executive','premium sedan'],
    highlights:['Panoramic sunroof in sedan','ADAS Level 2','Bose sound'],
    tags:['sedan','premium sedan','panoramic sunroof','adas','executive'],
  },
  {
    id:'hyundai-exter', name:'Hyundai Exter', brand:'Hyundai', type:'car',
    body:'Micro SUV', fuel:'Petrol', seats:5,
    priceMin:611000, priceMax:1024000, mileage:19.40, rating:4.1, ncap:3,
    transmission:['manual','automatic'],
    features:['touchscreen','rearCamera','4airbags','sunroof'],
    variants:[
      {name:'EX',    price:611000,  key:'Entry'},
      {name:'S',     price:780000,  key:'Mid'},
      {name:'SX',    price:924000,  key:'Sunroof'},
      {name:'SX(O)', price:1024000, key:'Top'},
    ],
    useCases:['city','first car','budget suv'],
    highlights:['Stylish micro-SUV','CNG variant available'],
    tags:['micro suv','affordable','city','first car'],
  },
  {
    id:'tata-nexon', name:'Tata Nexon', brand:'Tata', type:'car',
    body:'Compact SUV', fuel:'Petrol', seats:5,
    priceMin:800000, priceMax:1580000, mileage:17.01, rating:4.2, ncap:5,
    transmission:['manual','automatic'],
    features:['touchscreen','rearCamera','sunroof','6airbags','connectedCar','adas','airPurifier'],
    variants:[
      {name:'Smart',      price:800000,  key:'Entry'},
      {name:'Pure+',      price:912000,  key:'Good base'},
      {name:'Creative+',  price:1165000, key:'Sunroof, ADAS'},
      {name:'Fearless+',  price:1380000, key:'Top diesel/petrol'},
    ],
    useCases:['family','city','daily commute','safe car'],
    highlights:['5-star NCAP','ADAS standard','Air purifier','Best safety in segment'],
    tags:['compact suv','5 star ncap','safe','adas','petrol diesel'],
  },
  {
    id:'tata-nexon-ev', name:'Tata Nexon EV', brand:'Tata', type:'car',
    body:'Compact SUV', fuel:'Electric', seats:5,
    priceMin:1449000, priceMax:2099000, range:465, rating:4.3, ncap:5,
    transmission:['automatic'],
    features:['touchscreen','rearCamera','sunroof','6airbags','connectedCar','fastCharge','airPurifier'],
    variants:[
      {name:'Creative MR',   price:1449000, key:'30 kWh, 325 km'},
      {name:'Creative+ MR',  price:1549000, key:'30 kWh, features+'},
      {name:'Fearless+ LR',  price:1849000, key:'40.5 kWh, 465 km'},
      {name:'Empowered+ LR', price:2099000, key:'Top, 70kW charge'},
    ],
    useCases:['electric','city','daily commute','eco'],
    highlights:['Best-selling EV in India','5-star NCAP','60kW DC fast charge'],
    tags:['electric','suv','bestseller ev','5 star ncap','fast charge'],
  },
  {
    id:'tata-curvv-ev', name:'Tata Curvv EV', brand:'Tata', type:'car',
    body:'Coupe SUV', fuel:'Electric', seats:5,
    priceMin:1749000, priceMax:2199000, range:502, rating:4.4, ncap:5,
    transmission:['automatic'],
    features:['panoramicSunroof','touchscreen','360camera','ventilatedSeats','adas','v2l','6airbags','jbl','connectedCar','fastCharge','wirelessCharging'],
    variants:[
      {name:'Creative 45',      price:1749000, key:'45 kWh, 330 km'},
      {name:'Accomplished 45',  price:1849000, key:'Sunroof, V2L'},
      {name:'Accomplished+ 55', price:1999000, key:'55 kWh, 502 km — BEST VALUE'},
      {name:'Empowered+ 55',    price:2099000, key:'ADAS, ventilated seats'},
      {name:'Empowered+ Pro',   price:2199000, key:'Top — JBL, panoramic'},
    ],
    useCases:['electric','premium','highway','long drives'],
    highlights:['502 km range','V2L feature','5-star NCAP','Panoramic sunroof','70 kW DC fast charge'],
    tags:['electric','coupe suv','long range','v2l','panoramic sunroof','jbl','adas','5 star ncap'],
  },
  {
    id:'tata-punch', name:'Tata Punch', brand:'Tata', type:'car',
    body:'Micro SUV', fuel:'Petrol', seats:5,
    priceMin:600000, priceMax:1029000, mileage:18.82, rating:4.3, ncap:5,
    transmission:['manual','automatic'],
    features:['touchscreen','rearCamera','4airbags','connectedCar'],
    variants:[
      {name:'Pure',       price:600000,  key:'Entry'},
      {name:'Adventure',  price:742000,  key:'Mid'},
      {name:'Accomplished',price:874000, key:'Good features'},
      {name:'Creative',   price:1029000, key:'Top'},
    ],
    useCases:['city','first car','safe budget car'],
    highlights:['5-star NCAP in budget','Safest micro-SUV','CNG option available'],
    tags:['micro suv','5 star ncap','safe','affordable','first car'],
  },
  {
    id:'tata-punch-ev', name:'Tata Punch EV', brand:'Tata', type:'car',
    body:'Micro SUV', fuel:'Electric', seats:5,
    priceMin:999000, priceMax:1429000, range:421, rating:4.3, ncap:5,
    transmission:['automatic'],
    features:['touchscreen','rearCamera','fastCharge','connectedCar','4airbags'],
    variants:[
      {name:'Smart',       price:999000,  key:'25 kWh, 315 km'},
      {name:'Adventure',   price:1143000, key:'Better features'},
      {name:'Accomplished+',price:1299000,key:'35 kWh, 421 km'},
    ],
    useCases:['electric','city','budget ev','first ev'],
    highlights:['Most affordable 5-star NCAP EV','421 km range','Fast charge in 56 min'],
    tags:['electric','micro suv','affordable ev','5 star ncap','first ev'],
  },
  {
    id:'tata-harrier', name:'Tata Harrier', brand:'Tata', type:'car',
    body:'SUV', fuel:'Diesel', seats:5,
    priceMin:1499000, priceMax:2599000, mileage:16.80, rating:4.3, ncap:5,
    transmission:['manual','automatic'],
    features:['panoramicSunroof','touchscreen','360camera','ventilatedSeats','adas','jbl','6airbags','connectedCar'],
    variants:[
      {name:'Smart',      price:1499000, key:'Base'},
      {name:'Pure+',      price:1649000, key:'Mid'},
      {name:'Adventure+', price:1899000, key:'Sunroof, ADAS'},
      {name:'Fearless+',  price:2299000, key:'JBL, panoramic'},
      {name:'Fearless+ D',price:2599000, key:'Top Dark Edition'},
    ],
    useCases:['highway','family','premium diesel'],
    highlights:['Panoramic sunroof','JBL audio','5-star NCAP','ADAS Level 2'],
    tags:['suv','diesel','panoramic sunroof','5 star ncap','jbl','adas','premium'],
  },
  {
    id:'tata-safari', name:'Tata Safari', brand:'Tata', type:'car',
    body:'SUV', fuel:'Diesel', seats:7,
    priceMin:1605000, priceMax:2796000, mileage:16.30, rating:4.3, ncap:5,
    transmission:['manual','automatic'],
    features:['panoramicSunroof','touchscreen','360camera','ventilatedSeats','adas','jbl','6airbags','connectedCar','thirdRowSeating'],
    variants:[
      {name:'Smart',      price:1605000, key:'Base 7-seater'},
      {name:'Pure+',      price:1783000, key:'Mid'},
      {name:'Adventure+', price:2050000, key:'Sunroof, ADAS'},
      {name:'Fearless+',  price:2500000, key:'JBL, panoramic'},
    ],
    useCases:['7 seater','family','highway','premium diesel'],
    highlights:['7-seater','Panoramic sunroof','5-star NCAP','JBL audio'],
    tags:['7 seater','suv','diesel','panoramic sunroof','5 star ncap','jbl','family'],
  },
  {
    id:'mahindra-xuv700', name:'Mahindra XUV700', brand:'Mahindra', type:'car',
    body:'SUV', fuel:'Petrol', seats:7,
    priceMin:1399000, priceMax:2699000, mileage:15.63, rating:4.5, ncap:5,
    transmission:['manual','automatic'],
    features:['panoramicSunroof','touchscreen','360camera','ventilatedSeats','adas','driveSideAirbag','connectedCar','bose','wirelessCharging','awd'],
    variants:[
      {name:'MX',       price:1399000, key:'Base 5-seater'},
      {name:'MX+',      price:1599000, key:'7-seater'},
      {name:'AX3',      price:1749000, key:'ADAS, sunroof'},
      {name:'AX5',      price:2149000, key:'Bose, panoramic'},
      {name:'AX7 L AWD',price:2699000, key:'Top AWD Diesel'},
    ],
    useCases:['7 seater','family','highway','premium','offroad'],
    highlights:['5-star NCAP','Level 2 ADAS','Panoramic sunroof','Bose audio','AWD available'],
    tags:['7 seater','suv','5 star ncap','adas','panoramic sunroof','bose','awd','flagship'],
  },
  {
    id:'mahindra-thar-roxx', name:'Mahindra Thar Roxx', brand:'Mahindra', type:'car',
    body:'SUV', fuel:'Petrol', seats:5,
    priceMin:1299000, priceMax:2249000, mileage:15.20, rating:4.4, ncap:5,
    transmission:['manual','automatic'],
    features:['sunroof','touchscreen','360camera','6airbags','connectedCar','4x4','diff lock'],
    variants:[
      {name:'MX1',    price:1299000, key:'Base 4x2'},
      {name:'MX3',    price:1499000, key:'4x4, good features'},
      {name:'AX3 L',  price:1749000, key:'Auto, sunroof'},
      {name:'AX7 L',  price:2249000, key:'Top 4x4'},
    ],
    useCases:['offroad','adventure','highway','weekend drives'],
    highlights:['Best off-roader','5-star NCAP','4x4 with diff lock'],
    tags:['suv','offroad','adventure','4x4','5 star ncap','rugged'],
  },
  {
    id:'mahindra-scorpio-n', name:'Mahindra Scorpio-N', brand:'Mahindra', type:'car',
    body:'SUV', fuel:'Petrol', seats:7,
    priceMin:1399000, priceMax:2469000, mileage:14.00, rating:4.3, ncap:5,
    transmission:['manual','automatic'],
    features:['sunroof','touchscreen','6airbags','connectedCar','4x4'],
    variants:[
      {name:'Z2',   price:1399000, key:'Base 6-seater'},
      {name:'Z4',   price:1540000, key:'Diesel option'},
      {name:'Z6',   price:1842000, key:'Sunroof, good value'},
      {name:'Z8 L', price:2469000, key:'Top 7-seater 4x4'},
    ],
    useCases:['7 seater','family','offroad','highway'],
    highlights:['5-star NCAP','Powerful diesel option','7-seater with 3rd row'],
    tags:['7 seater','suv','5 star ncap','offroad','diesel'],
  },
  {
    id:'mahindra-xuv-3xo', name:'Mahindra XUV 3XO', brand:'Mahindra', type:'car',
    body:'Compact SUV', fuel:'Petrol', seats:5,
    priceMin:799000, priceMax:1582000, mileage:17.96, rating:4.3, ncap:5,
    transmission:['manual','automatic'],
    features:['panoramicSunroof','touchscreen','360camera','6airbags','connectedCar'],
    variants:[
      {name:'MX1',   price:799000,  key:'Entry'},
      {name:'MX3+',  price:1001000, key:'Mid'},
      {name:'AX5',   price:1205000, key:'Panoramic sunroof'},
      {name:'AX7 L', price:1582000, key:'Top — all features'},
    ],
    useCases:['city','family','first suv'],
    highlights:['Panoramic sunroof under ₹12L','5-star NCAP','360 camera'],
    tags:['compact suv','panoramic sunroof','5 star ncap','affordable suv'],
  },
  {
    id:'honda-city', name:'Honda City', brand:'Honda', type:'car',
    body:'Sedan', fuel:'Petrol', seats:5,
    priceMin:1199000, priceMax:1650000, mileage:18.40, rating:4.3, ncap:null,
    transmission:['manual','automatic'],
    features:['touchscreen','rearCamera','6airbags','laneWatch','connectedCar','sunroof'],
    variants:[
      {name:'V',    price:1199000, key:'Good entry'},
      {name:'VX',   price:1360000, key:'Sunroof, Honda Connect'},
      {name:'ZX',   price:1490000, key:'Top petrol'},
      {name:'ZX Hybrid',price:1650000,key:'Strong Hybrid, 32 kmpl'},
    ],
    useCases:['highway','executive','premium sedan','family'],
    highlights:['32 kmpl Hybrid variant','Honda reliability','Premium sedan'],
    tags:['sedan','honda','reliable','hybrid option','executive'],
  },
  {
    id:'honda-elevate', name:'Honda Elevate', brand:'Honda', type:'car',
    body:'SUV', fuel:'Petrol', seats:5,
    priceMin:1109000, priceMax:1587000, mileage:15.26, rating:4.2, ncap:2,
    transmission:['manual','automatic'],
    features:['sunroof','touchscreen','rearCamera','6airbags','laneWatch'],
    variants:[
      {name:'V',   price:1109000, key:'Entry'},
      {name:'VX',  price:1299000, key:'Mid, sunroof'},
      {name:'ZX',  price:1587000, key:'Top'},
    ],
    useCases:['family','city','highway'],
    highlights:['Smooth CVT','Honda reliability'],
    tags:['suv','honda','reliable','family'],
  },
  {
    id:'kia-seltos', name:'Kia Seltos', brand:'Kia', type:'car',
    body:'SUV', fuel:'Petrol', seats:5,
    priceMin:1090000, priceMax:2030000, mileage:16.50, rating:4.3, ncap:null,
    transmission:['manual','automatic'],
    features:['panoramicSunroof','touchscreen','360camera','ventilatedSeats','adas','bose','6airbags','connectedCar','wirelessCharging'],
    variants:[
      {name:'HTK',     price:1090000, key:'Entry'},
      {name:'HTK+',    price:1263000, key:'Mid'},
      {name:'HTX',     price:1483000, key:'Sunroof, ADAS'},
      {name:'GTX+',    price:2030000, key:'Top — Bose, panoramic, ventilated'},
    ],
    useCases:['premium','highway','family','feature-loaded'],
    highlights:['Bose premium audio','Panoramic sunroof','ADAS Level 2','Ventilated seats'],
    tags:['suv','panoramic sunroof','bose','adas','ventilated seats','premium'],
  },
  {
    id:'kia-carens', name:'Kia Carens', brand:'Kia', type:'car',
    body:'MPV', fuel:'Petrol', seats:7,
    priceMin:1050000, priceMax:2082000, mileage:16.50, rating:4.2, ncap:3,
    transmission:['manual','automatic'],
    features:['panoramicSunroof','touchscreen','360camera','6airbags','connectedCar','bose'],
    variants:[
      {name:'Premium',      price:1050000, key:'6-seater entry'},
      {name:'Prestige',     price:1300000, key:'7-seater features'},
      {name:'Prestige+',    price:1650000, key:'Sunroof'},
      {name:'Luxury+',      price:2082000, key:'Top — Bose, panoramic'},
    ],
    useCases:['7 seater','family','mpv','highway'],
    highlights:['Panoramic sunroof MPV','Bose audio','3-row comfort'],
    tags:['7 seater','mpv','panoramic sunroof','bose','family'],
  },
  {
    id:'toyota-innova-hycross', name:'Toyota Innova Hycross', brand:'Toyota', type:'car',
    body:'MPV', fuel:'Hybrid', seats:7,
    priceMin:1899000, priceMax:3045000, mileage:23.24, rating:4.5, ncap:null,
    transmission:['automatic'],
    features:['panoramicSunroof','touchscreen','360camera','ventilatedSeats','adas','7airbags','ottoman seats','powerSlidingDoors','ottoman'],
    variants:[
      {name:'G',       price:1899000, key:'Base'},
      {name:'GX',      price:2100000, key:'Mid'},
      {name:'VX',      price:2500000, key:'Sunroof, ADAS'},
      {name:'ZX',      price:3045000, key:'Top — ottoman, sliding doors'},
    ],
    useCases:['7 seater','highway','luxury mpv','family','chauffeur'],
    highlights:['Best-in-class 7-seater','23 kmpl hybrid','Ottoman rear seats','Power sliding doors'],
    tags:['7 seater','mpv','hybrid','luxury','panoramic sunroof','ottoman','premium'],
  },
  {
    id:'toyota-fortuner', name:'Toyota Fortuner', brand:'Toyota', type:'car',
    body:'SUV', fuel:'Diesel', seats:7,
    priceMin:3299000, priceMax:5099000, mileage:10.00, rating:4.4, ncap:null,
    transmission:['manual','automatic'],
    features:['sunroof','touchscreen','360camera','ventilatedSeats','7airbags','4x4','connectedCar'],
    variants:[
      {name:'Std Diesel MT',  price:3299000, key:'Base 4x2'},
      {name:'Std Diesel AT',  price:3480000, key:'Auto'},
      {name:'Legender',       price:4490000, key:'Premium looks'},
      {name:'Legender 4x4',   price:5099000, key:'Top 4x4'},
    ],
    useCases:['premium','7 seater','offroad','highway','status'],
    highlights:['Best resale value in class','4x4 with low range','Iconic nameplate'],
    tags:['suv','diesel','premium','7 seater','4x4','status car','high resale'],
  },
  {
    id:'mg-hector', name:'MG Hector', brand:'MG', type:'car',
    body:'SUV', fuel:'Petrol', seats:5,
    priceMin:1399000, priceMax:2199000, mileage:14.18, rating:4.1, ncap:null,
    transmission:['manual','automatic'],
    features:['panoramicSunroof','touchscreen','360camera','6airbags','connectedCar','airPurifier'],
    variants:[
      {name:'Style',   price:1399000, key:'Entry'},
      {name:'Smart',   price:1622000, key:'Panoramic sunroof'},
      {name:'Sharp',   price:1870000, key:'All features'},
      {name:'Savvy',   price:2199000, key:'Top'},
    ],
    useCases:['family','city','highway'],
    highlights:['Largest infotainment screen','Panoramic sunroof','Air purifier'],
    tags:['suv','panoramic sunroof','large screen','connected car'],
  },
  {
    id:'mg-windsor-ev', name:'MG Windsor EV', brand:'MG', type:'car',
    body:'SUV', fuel:'Electric', seats:5,
    priceMin:1399900, priceMax:1599900, range:331, rating:4.2, ncap:null,
    transmission:['automatic'],
    features:['panoramicSunroof','touchscreen','recliningRearSeats','6airbags','connectedCar','v2l'],
    variants:[
      {name:'Excite',  price:1399900, key:'Base EV'},
      {name:'Exclusive',price:1499900,key:'More features'},
      {name:'Essence', price:1599900, key:'Top — reclining seats'},
    ],
    useCases:['electric','city','comfortable ev'],
    highlights:['Reclining rear seats','V2L','Panoramic sunroof','Battery-as-a-service available'],
    tags:['electric','suv','panoramic sunroof','v2l','reclining seats','affordable ev'],
  },
  {
    id:'volkswagen-taigun', name:'Volkswagen Taigun', brand:'Volkswagen', type:'car',
    body:'Compact SUV', fuel:'Petrol', seats:5,
    priceMin:1159000, priceMax:1979000, mileage:19.04, rating:4.3, ncap:5,
    transmission:['manual','automatic'],
    features:['sunroof','touchscreen','ventilatedSeats','6airbags','connectedCar','wirelessCharging'],
    variants:[
      {name:'Comfortline',   price:1159000, key:'Base'},
      {name:'Topline',       price:1380000, key:'Sunroof, DSG auto'},
      {name:'GT Plus',       price:1979000, key:'Top — ventilated, 1.5L'},
    ],
    useCases:['highway','premium','spirited driving'],
    highlights:['5-star NCAP','German engineering','Best-in-class highway dynamics'],
    tags:['compact suv','5 star ncap','german','highway','premium','ventilated seats'],
  },
  {
    id:'skoda-slavia', name:'Skoda Slavia', brand:'Skoda', type:'car',
    body:'Sedan', fuel:'Petrol', seats:5,
    priceMin:1089000, priceMax:1879000, mileage:19.26, rating:4.2, ncap:5,
    transmission:['manual','automatic'],
    features:['sunroof','touchscreen','ventilatedSeats','6airbags','connectedCar','wirelessCharging'],
    variants:[
      {name:'Active',  price:1089000, key:'Entry'},
      {name:'Ambition',price:1329000, key:'Sunroof, DSG'},
      {name:'Style',   price:1879000, key:'Top — ventilated, 1.5L'},
    ],
    useCases:['highway','premium sedan','spirited driving'],
    highlights:['5-star NCAP','Ventilated seats in sedan','Czech engineering'],
    tags:['sedan','5 star ncap','premium','ventilated seats','european'],
  },
  {
    id:'renault-triber', name:'Renault Triber', brand:'Renault', type:'car',
    body:'MPV', fuel:'Petrol', seats:7,
    priceMin:615000, priceMax:870000, mileage:19.00, rating:4.0, ncap:4,
    transmission:['manual','automatic'],
    features:['touchscreen','rearCamera','4airbags'],
    variants:[
      {name:'RXE',  price:615000, key:'Entry 5-seater'},
      {name:'RXL',  price:720000, key:'7-seater'},
      {name:'RXT',  price:870000, key:'Top'},
    ],
    useCases:['7 seater','affordable mpv','city','first car'],
    highlights:['Most affordable 7-seater in India','4-star NCAP','Compact footprint'],
    tags:['7 seater','affordable','mpv','compact mpv','budget 7 seater'],
  },
  // ── BIKES ──────────────────────────────────────────────────────────────────────────────────
  {
    id:'re-classic-350', name:'Royal Enfield Classic 350', brand:'Royal Enfield', type:'bike',
    body:'Cruiser', fuel:'Petrol', seats:2,
    priceMin:193500, priceMax:225000, mileage:35.0, rating:4.3, ncap:null,
    transmission:['manual'],
    features:['tripper','dualChannel abs','led lights'],
    variants:[
      {name:'Halcyon',  price:193500, key:'Entry'},
      {name:'Signals',  price:211000, key:'Unique colors'},
      {name:'Dark',     price:218500, key:'Black theme'},
      {name:'Chrome',   price:225000, key:'Top'},
    ],
    useCases:['touring','highway','weekend rides','retro enthusiast'],
    highlights:['Iconic retro styling','Tripper navigation','Comfortable for long rides'],
    tags:['cruiser','retro','touring','classic','royal enfield'],
  },
  {
    id:'honda-activa-6g', name:'Honda Activa 6G', brand:'Honda', type:'bike',
    body:'Scooter', fuel:'Petrol', seats:2,
    priceMin:74536, priceMax:77536, mileage:60.0, rating:4.3, ncap:null,
    transmission:['automatic'],
    features:['led lights','silent start','external fuel fill'],
    variants:[
      {name:'STD',    price:74536, key:'Standard'},
      {name:'DLX',    price:82184, key:'More features'},
      {name:'H-Smart',price:89712,key:'Smart connectivity'},
    ],
    useCases:['city','daily commute','family scooter'],
    highlights:['Best-selling scooter in India','60 kmpl','H-Smart variant with Bluetooth'],
    tags:['scooter','bestseller','commuter','family','practical'],
  },
  {
    id:'bajaj-pulsar-ns400', name:'Bajaj Pulsar NS400Z', brand:'Bajaj', type:'bike',
    body:'Sports', fuel:'Petrol', seats:2,
    priceMin:185000, priceMax:197000, mileage:25.0, rating:4.2, ncap:null,
    transmission:['manual'],
    features:['dualChannel abs','tft display','led lights','slipper clutch'],
    variants:[
      {name:'Standard',      price:185000, key:'Single channel ABS'},
      {name:'Dual Channel',  price:197000, key:'Dual ABS, TFT'},
    ],
    useCases:['performance','highway','daily commute'],
    highlights:['Largest Pulsar ever','TFT display','Slipper clutch'],
    tags:['sports','performance','bajaj','highway','naked sports'],
  },
  {
    id:'yamaha-r15-v4', name:'Yamaha R15 V4', brand:'Yamaha', type:'bike',
    body:'Sports', fuel:'Petrol', seats:2,
    priceMin:172000, priceMax:182000, mileage:45.0, rating:4.3, ncap:null,
    transmission:['manual'],
    features:['traction control','quick shifter','led lights','tft display','dualChannel abs'],
    variants:[
      {name:'V4',   price:172000, key:'Standard'},
      {name:'V4 MotoGP',price:182000,key:'MotoGP livery'},
    ],
    useCases:['track','performance','sports enthusiast'],
    highlights:['Variable Valve Actuation','Traction control','MotoGP-inspired'],
    tags:['sports','track','yamaha','performance','vva'],
  },
  {
    id:'ola-s1-pro', name:'Ola S1 Pro', brand:'Ola', type:'bike',
    body:'Scooter', fuel:'Electric', seats:2,
    priceMin:147000, priceMax:147000, range:195, rating:4.0, ncap:null,
    transmission:['automatic'],
    features:['touchscreen','regen braking','hill assist','reverse mode'],
    variants:[
      {name:'S1 Pro', price:147000, key:'Single variant'},
    ],
    useCases:['city','electric commute','eco'],
    highlights:['Touchscreen dashboard','Reverse mode','Fast charge'],
    tags:['electric scooter','city','eco','smart'],
  },
  {
    id:'hero-splendor-plus', name:'Hero Splendor Plus', brand:'Hero', type:'bike',
    body:'Commuter', fuel:'Petrol', seats:2,
    priceMin:77336, priceMax:80136, mileage:80.0, rating:4.2, ncap:null,
    transmission:['manual'],
    features:['i3s idle stop','led daytime lights'],
    variants:[
      {name:'Kick',    price:77336, key:'Kick start'},
      {name:'Self',    price:80136, key:'Self start'},
    ],
    useCases:['daily commute','rural','economical'],
    highlights:['80 kmpl mileage','Most dependable commuter','Low maintenance'],
    tags:['commuter','mileage','economical','reliable','hero'],
  },
  {
    id:'ktm-duke-390', name:'KTM Duke 390', brand:'KTM', type:'bike',
    body:'Naked', fuel:'Petrol', seats:2,
    priceMin:311000, priceMax:311000, mileage:30.0, rating:4.4, ncap:null,
    transmission:['manual'],
    features:['cornering abs','traction control','quickshifter','tft display','lean sensor'],
    variants:[
      {name:'Duke 390', price:311000, key:'Single variant'},
    ],
    useCases:['performance','highway','spirited riding'],
    highlights:['Cornering ABS','4 riding modes','Best-in-class electronics'],
    tags:['naked','performance','premium bike','ktm','electronics'],
  },
  {
    id:'tvs-jupiter-125', name:'TVS Jupiter 125', brand:'TVS', type:'bike',
    body:'Scooter', fuel:'Petrol', seats:2,
    priceMin:83000, priceMax:93000, mileage:62.0, rating:4.2, ncap:null,
    transmission:['automatic'],
    features:['usb charging','led lights','bluetooth'],
    variants:[
      {name:'STD',    price:83000, key:'Standard'},
      {name:'Classic',price:88000, key:'Bluetooth'},
      {name:'ZX',    price:93000, key:'Top'},
    ],
    useCases:['city','daily commute','family scooter'],
    highlights:['62 kmpl','USB charging','Smooth ride quality'],
    tags:['scooter','commuter','practical','family','tvs'],
  },
];

/* ═══════════════════════════════════════════════════════════
   BUILD COMPACT DB STRING FOR SYSTEM PROMPT
   ═══════════════════════════════════════════════════════════ */
const DB_STRING = VEHICLES.map(v => {
  const pMin = (v.priceMin / 100000).toFixed(2);
  const pMax = (v.priceMax / 100000).toFixed(2);
  const eff  = v.mileage ? `mileage:${v.mileage}kmpl` : (v.range ? `range:${v.range}km` : '');
  const ftrs = (v.features || []).join(',');
  const vars = (v.variants || []).map(vr => `${vr.name}@₹${(vr.price/100000).toFixed(2)}L`).join('|');
  const use  = (v.useCases || []).join(',');
  const ncap = v.ncap ? `ncap:${v.ncap}star` : '';
  const tx   = (v.transmission || []).join('/');
  return [v.id, v.name, v.brand, v.type, v.body, v.fuel, `seats:${v.seats}`,
          `₹${pMin}L-₹${pMax}L`, eff, ncap, tx, `features:[${ftrs}]`,
          `variants:[${vars}]`, `usecases:[${use}]`].filter(Boolean).join('|');
}).join('\n');

const CITY_LIST = Object.keys(CITIES).join(', ');

/* ═══════════════════════════════════════════════════════════
   SYSTEM PROMPT
   ═══════════════════════════════════════════════════════════ */
const SYSTEM_PROMPT = `You are an expert Indian automotive AI assistant embedded in an auto portal website. You help users find cars/bikes, calculate on-road prices, compare vehicles, get variant recommendations, and answer any car/bike related question.

VEHICLE DATABASE (pipe-separated fields):
${DB_STRING}

CITIES WITH ORP SUPPORT: ${CITY_LIST}

RESPONSE FORMAT — always return valid raw JSON (no markdown fences) in this exact structure:
{
  "queryType": "general|budget|feature|orp|comparison|variant|brand|usecase|safety|specs",
  "reply": "Conversational response (2-4 sentences, friendly, in simple English). Use ** for bold. Quote prices in ₹ lakhs.",
  "vehicleIds": ["id1","id2"],
  "orpRequest": {"vehicleId":"id","cityKey":"cityname","variantPrice":1234567} or null,
  "comparisonIds": ["id1","id2"] or null,
  "variantAdvice": {"vehicleId":"id","recommended":"variant name","reason":"why"} or null,
  "followUps": ["follow-up question 1","follow-up question 2","follow-up question 3"]
}

QUERY TYPE RULES:

1. BUDGET ("under 15L", "between 10-20L", "cheap SUV"):
   - Filter vehicles where priceMin ≤ budget (allow 10% tolerance)
   - Sort by rating descending
   - queryType: "budget"

2. FEATURE ("panoramic sunroof", "ADAS", "V2L", "ventilated seats", "JBL", "360 camera", "wireless charging", "sunroof", "air purifier", "4x4", "AWD", "automatic"):
   - Filter vehicles whose features[] contains the requested feature(s)
   - Feature keywords: panoramicSunroof, sunroof, adas, v2l, ventilatedSeats, jbl, bose, 360camera, wirelessCharging, airPurifier, awd, 4x4, dualChannelAbs, tftDisplay
   - queryType: "feature"

3. ON-ROAD PRICE ("Nexon on road price Mumbai", "ORP of Creta in Delhi", "total cost of Thar Roxx in Bangalore"):
   - Set orpRequest with vehicleId, cityKey (lowercase city name), and variantPrice (use priceMin as default)
   - queryType: "orp"
   - reply should explain that ORP = ex-showroom + road tax + registration + insurance + handling

4. COMPARISON ("Nexon vs Punch EV", "compare Creta and Seltos", "which is better Thar or Scorpio"):
   - Set comparisonIds with exactly 2 vehicle IDs
   - Provide a balanced comparison in reply (3-4 key differences)
   - queryType: "comparison"

5. VARIANT ADVICE ("which Creta should I buy", "best variant of Nexon EV", "which trim is worth it"):
   - Set variantAdvice with vehicleId, recommended variant name, and clear reason
   - Include all vehicleIds: [vehicleId]
   - queryType: "variant"

6. BRAND ("all Tata cars", "Hyundai SUVs", "Maruti models under 15L"):
   - Filter by brand field
   - queryType: "brand"

7. USE CASE ("best car for highway", "city commuter", "family SUV", "off-road car", "car for Mumbai traffic", "long drives", "first car", "car for seniors"):
   - Match to useCases[] field
   - queryType: "usecase"

8. SAFETY ("safest car under 15L", "5 star NCAP cars", "cars with most airbags"):
   - Filter by ncap field or features with airbag counts
   - queryType: "safety"

9. SPECS ("mileage of Swift", "range of Nexon EV", "ground clearance of Thar", "boot space of Creta"):
   - Answer from database, provide accurate spec in reply
   - Set vehicleIds to the relevant vehicle
   - queryType: "specs"

GENERAL RULES:
- vehicleIds: max 8 IDs, from the database only — NEVER invent IDs
- For greetings, set vehicleIds:[], queryType:"general", give helpful intro
- Prices always in ₹ lakhs (e.g. "₹14.5 lakh")
- NEVER mention CarDekho, CarWale, ZigWheels, or any other portal/competitor
- Keep reply warm, conversational, and jargon-free
- followUps: 3 natural next questions the user might ask
- If a query is unclear, ask for clarification in reply and set vehicleIds:[]`;

/* ═══════════════════════════════════════════════════════════
   EXPRESS APP
   ═══════════════════════════════════════════════════════════ */
const app = express();
app.use(express.json({ limit: '16kb' }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*', methods: ['POST','OPTIONS','GET'] }));
app.use('/api/', rateLimit({ windowMs: 60000, max: 40, message: { error: 'Too many requests. Please try again shortly.' } }));

app.get('/api/health', (_req, res) => res.json({ status:'ok', model:MODEL, vehicles:VEHICLES.length }));

app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
  if (message.length > 600) return res.status(400).json({ error: 'message too long' });

  const trimmedHistory = (Array.isArray(history) ? history : [])
    .slice(-12).filter(m => m.role && m.content);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [...trimmedHistory, { role:'user', content: message.trim() }],
    });

    const raw = (response.content?.[0]?.text || '{}').trim()
      .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { reply: raw, vehicleIds:[], queryType:'general' }; }

    // Resolve vehicle IDs safely
    const idMap = Object.fromEntries(VEHICLES.map(v => [v.id, v]));
    const resolveIds = ids => (Array.isArray(ids) ? ids : [])
      .filter(id => idMap[id])
      .map(id => {
        const v = idMap[id];
        return { id:v.id, name:v.name, brand:v.brand, type:v.type, body:v.body,
                 fuel:v.fuel, seats:v.seats, priceMin:v.priceMin, priceMax:v.priceMax,
                 mileage:v.mileage||null, range:v.range||null, rating:v.rating,
                 ncap:v.ncap||null, features:v.features||[], variants:v.variants||[],
                 highlights:v.highlights||[], transmission:v.transmission||[] };
      });

    const vehicles      = resolveIds(parsed.vehicleIds);
    const compVehicles  = parsed.comparisonIds ? resolveIds(parsed.comparisonIds) : null;

    // ORP calculation
    let orpData = null;
    if (parsed.orpRequest) {
      const { vehicleId, cityKey, variantPrice } = parsed.orpRequest;
      const veh = idMap[vehicleId];
      if (veh && cityKey) {
        const city = cityKey.toLowerCase().replace(/\s+/g,'');
        const price = variantPrice || veh.priceMin;
        orpData = calcORP(price, city, veh.fuel);
        if (orpData) orpData.vehicleName = veh.name;
      }
    }

    // Variant advice
    let variantAdvice = null;
    if (parsed.variantAdvice) {
      const veh = idMap[parsed.variantAdvice.vehicleId];
      if (veh) {
        variantAdvice = {
          vehicleName: veh.name,
          recommended: parsed.variantAdvice.recommended,
          reason: parsed.variantAdvice.reason,
          allVariants: veh.variants || [],
        };
      }
    }

    return res.json({
      queryType:    parsed.queryType || 'general',
      reply:        parsed.reply || '',
      vehicles,
      orpData,
      comparisonVehicles: compVehicles,
      variantAdvice,
      followUps:    parsed.followUps || [],
    });

  } catch (err) {
    console.error('[Claude error]', err.message);
    return res.status(err.status || 500).json({
      error: err.status === 429 ? 'AI service is busy. Please try again shortly.' : 'Something went wrong. Please try again.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`[AI Server] http://localhost:${PORT} · Model: ${MODEL} · ${VEHICLES.length} vehicles`);
});
