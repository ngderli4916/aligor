import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createInvoice, updateInvoice, invoiceAction, findPublicInvoice, listInvoices, deleteInvoice } from '../invoice.js';
import { invoicePage } from '../invoiceui.js';

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  return { PUBLIC_BASE_URL:'https://aligor.test', WHATSAPP_NUMBER:'60167871902', DB:{ raw:db, prepare(sql){let params=[];const st={bind(...x){params=x;return st},async run(){const r=db.prepare(sql).run(...params);return{success:true,meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}},async first(){return db.prepare(sql).get(...params)??null},async all(){return{results:db.prepare(sql).all(...params)}}};return st}}};
}
const data = (extra={}) => ({document_type:'invoice',customer_name:'测试顾客',customer_phone:'0167871902',issue_date:'2026-10-19',due_date:'2026-10-26',discount:10,tax_rate:0,source_order_id:'AICL00001',items:[{description:'AI Agent 一天实战课程',quantity:2,unit_price:399}],...extra});

test('invoice lifecycle: draft is private, editable, numbered, issued, paid and printable', async()=>{
  const env=makeEnv();
  const draft=await createInvoice(env,data());
  assert.match(draft.invoice_no,/^ALI-\d{6}-00001$/); assert.equal(draft.total,'788.00'); assert.equal(draft.customer_phone,'60167871902');
  assert.equal(await findPublicInvoice(env,draft.public_id),null);
  const edited=await updateInvoice(env,draft.id,data({discount:0,items:[{description:'AI Agent 一天实战课程',quantity:1,unit_price:399}]}));
  assert.equal(edited.total,'399.00');
  const issued=await invoiceAction(env,draft.id,'issue'); assert.equal(issued.status,'issued');
  const publicRow=await findPublicInvoice(env,draft.public_id); assert.equal(publicRow.total,'399.00');
  const page=invoicePage(publicRow); assert.match(page,/测试顾客/); assert.match(page,/RM 399\.00/); assert.match(page,/打印 \/ 保存 PDF/);
  await assert.rejects(()=>updateInvoice(env,draft.id,data()),/只有草稿/);
  const paid=await invoiceAction(env,draft.id,'paid'); assert.equal(paid.status,'paid');
  const listed=await listInvoices(env,new URL('https://aligor.test/api/admin/invoices?status=paid')); assert.equal(listed.stats.paid,1); assert.equal(listed.stats.paid_amount,'399.00');
});

test('invoice validation and draft-only deletion',async()=>{
  const env=makeEnv();
  await assert.rejects(()=>createInvoice(env,data({customer_name:'',items:[]})),/顾客姓名/);
  const draft=await createInvoice(env,data({customer_phone:''}));
  assert.deepEqual(await deleteInvoice(env,draft.id),{ok:true});
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM invoices').get().n,0);
});
