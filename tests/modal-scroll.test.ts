import test from 'node:test';
import assert from 'node:assert/strict';
import { lockPageScroll } from '../src/modalScroll.ts';
test('parent-first cleanup restores scrolling only after the nested dialog closes', () => {
 const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
 const document = {body:{style:{overflow:'auto'}}};
 Object.defineProperty(globalThis, 'document', {configurable:true,value:document});
 const parent = lockPageScroll(), nested = lockPageScroll();
 try {
   assert.equal(document.body.style.overflow,'hidden');
   parent(); assert.equal(document.body.style.overflow,'hidden');
   parent(); assert.equal(document.body.style.overflow,'hidden');
   nested(); assert.equal(document.body.style.overflow,'auto');
   const next = lockPageScroll(); next(); assert.equal(document.body.style.overflow,'auto');
 } finally {
   parent(); nested();
   if (before) Object.defineProperty(globalThis, 'document', before); else Reflect.deleteProperty(globalThis, 'document');
 }
});
test('nested-first cleanup keeps the remaining full-screen player locked', () => {
 const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
 const document = {body:{style:{overflow:''}}};
 Object.defineProperty(globalThis, 'document', {configurable:true,value:document});
 const parent = lockPageScroll(), nested = lockPageScroll();
 try {
   nested(); assert.equal(document.body.style.overflow,'hidden');
   parent(); assert.equal(document.body.style.overflow,'');
 } finally {
   parent(); nested();
   if (before) Object.defineProperty(globalThis, 'document', before); else Reflect.deleteProperty(globalThis, 'document');
 }
});
