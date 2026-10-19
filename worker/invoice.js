import { cleanText, normalizePhone, csvEscape } from './lib.js';

const TYPES = new Set(['invoice', 'receipt']);
const STATUSES = new Set(['draft', 'issued', 'paid', 'cancelled']);
const now = () => new Date().toISOString();
const cents = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new InvoiceError('金额不正确');
  return Math.round(n * 100);
};
const money = value => (Number(value || 0) / 100).toFixed(2);

export class InvoiceError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const INVOICE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no TEXT NOT NULL UNIQUE,
    public_id TEXT NOT NULL UNIQUE,
    document_type TEXT NOT NULL DEFAULT 'invoice' CHECK(document_type IN ('invoice','receipt')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','paid','cancelled')),
    customer_name TEXT NOT NULL,
    customer_company TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',
    customer_email TEXT NOT NULL DEFAULT '',
    customer_address TEXT NOT NULL DEFAULT '',
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'MYR',
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    tax_rate REAL NOT NULL DEFAULT 0,
    tax_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    terms TEXT NOT NULL DEFAULT '',
    source_order_id TEXT NOT NULL DEFAULT '',
    issuer_name TEXT NOT NULL,
    issuer_brand TEXT NOT NULL DEFAULT 'Aligor',
    issuer_reg_no TEXT NOT NULL DEFAULT '',
    issuer_tin TEXT NOT NULL DEFAULT '',
    issuer_address TEXT NOT NULL DEFAULT '',
    issuer_phone TEXT NOT NULL DEFAULT '',
    issued_at TEXT,
    paid_at TEXT,
    cancelled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices(status, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_name, customer_phone)',
  'CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id, position)',
  'CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice ON invoice_events(invoice_id, created_at DESC)'
];

const readyDbs = new WeakSet();
export async function ensureInvoiceTables(env) {
  if (readyDbs.has(env.DB)) return;
  for (const sql of INVOICE_SCHEMA) await env.DB.prepare(sql).run();
  readyDbs.add(env.DB);
}

function issuer(env) {
  return {
    name: cleanText(env.INVOICE_ISSUER_NAME || 'NILI RESOURCES', 120),
    brand: cleanText(env.INVOICE_ISSUER_BRAND || 'Aligor', 80),
    regNo: cleanText(env.INVOICE_ISSUER_REG_NO || '', 80),
    tin: cleanText(env.INVOICE_ISSUER_TIN || '', 80),
    address: cleanText(env.INVOICE_ISSUER_ADDRESS || '25, Jalan Pertama 4, Pusat Perdagangan Danga Utama, 81200 Johor Bahru, Johor', 300),
    phone: cleanText(env.INVOICE_ISSUER_PHONE || env.WHATSAPP_NUMBER || '60167871902', 40)
  };
}

function validate(data) {
  const type = cleanText(data.document_type || 'invoice', 20);
  if (!TYPES.has(type)) throw new InvoiceError('单据类型不正确');
  const name = cleanText(data.customer_name, 120);
  if (name.length < 2) throw new InvoiceError('请填写顾客姓名');
  let phone = cleanText(data.customer_phone, 40);
  if (phone) { try { phone = normalizePhone(phone); } catch (e) { throw new InvoiceError(e.message); } }
  const email = cleanText(data.customer_email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvoiceError('Email 格式不正确');
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length || items.length > 30) throw new InvoiceError('请加入至少一个项目');
  const parsed = items.map((item, i) => {
    const description = cleanText(item.description, 240);
    const quantity = Number(item.quantity);
    if (!description) throw new InvoiceError(`第 ${i + 1} 项没有名称`);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) throw new InvoiceError(`第 ${i + 1} 项数量不正确`);
    const unit = cents(item.unit_price);
    return { description, quantity: Math.round(quantity * 1000) / 1000, unit, amount: Math.round(quantity * unit) };
  });
  const subtotal = parsed.reduce((sum, item) => sum + item.amount, 0);
  const discount = cents(data.discount || 0);
  if (discount > subtotal) throw new InvoiceError('折扣不能超过小计');
  const taxRate = Number(data.tax_rate || 0);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new InvoiceError('税率不正确');
  const tax = Math.round((subtotal - discount) * taxRate / 100);
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(data.issue_date || '')) ? String(data.issue_date) : new Date().toISOString().slice(0, 10);
  const dueDate = cleanText(data.due_date, 10);
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new InvoiceError('到期日不正确');
  return {
    type, name, phone, email,
    company: cleanText(data.customer_company, 120), address: cleanText(data.customer_address, 400),
    issueDate, dueDate, items: parsed, subtotal, discount, taxRate, tax, total: subtotal - discount + tax,
    notes: cleanText(data.notes, 1000), terms: cleanText(data.terms, 1000), sourceOrderId: cleanText(data.source_order_id, 80)
  };
}

async function event(env, id, type, details = '') {
  await env.DB.prepare('INSERT INTO invoice_events(invoice_id,event_type,actor,details,created_at) VALUES(?,?,?,?,?)').bind(id, type, 'admin', cleanText(details, 500), now()).run();
}

async function loadFull(env, where, value) {
  await ensureInvoiceTables(env);
  const row = await env.DB.prepare(`SELECT * FROM invoices WHERE ${where}=?`).bind(value).first();
  if (!row) return null;
  row.items = (await env.DB.prepare('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY position,id').bind(row.id).all()).results;
  return row;
}

export async function createInvoice(env, data) {
  await ensureInvoiceTables(env);
  const v = validate(data), t = now(), pub = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().slice(0, 8).replaceAll('-', ''), iss = issuer(env);
  const result = await env.DB.prepare(`INSERT INTO invoices(invoice_no,public_id,document_type,status,customer_name,customer_company,customer_phone,customer_email,customer_address,issue_date,due_date,subtotal_cents,discount_cents,tax_rate,tax_cents,total_cents,notes,terms,source_order_id,issuer_name,issuer_brand,issuer_reg_no,issuer_tin,issuer_address,issuer_phone,created_at,updated_at)
    VALUES('ALI-'||strftime('%Y%m','now')||'-'||printf('%05d',(SELECT COALESCE(MAX(id),0)+1 FROM invoices)),?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(pub,v.type,v.name,v.company,v.phone,v.email,v.address,v.issueDate,v.dueDate,v.subtotal,v.discount,v.taxRate,v.tax,v.total,v.notes,v.terms,v.sourceOrderId,iss.name,iss.brand,iss.regNo,iss.tin,iss.address,iss.phone,t,t).run();
  const id = Number(result.meta.last_row_id);
  for (let i = 0; i < v.items.length; i++) {
    const x = v.items[i];
    await env.DB.prepare('INSERT INTO invoice_items(invoice_id,position,description,quantity,unit_price_cents,amount_cents) VALUES(?,?,?,?,?,?)').bind(id,i+1,x.description,x.quantity,x.unit,x.amount).run();
  }
  await event(env,id,'created',`total=${money(v.total)}`);
  return publicRow(await loadFull(env,'id',id), env);
}

export async function updateInvoice(env, id, data) {
  const current = await loadFull(env,'id',id);
  if (!current) throw new InvoiceError('找不到这张单据',404);
  if (current.status !== 'draft') throw new InvoiceError('只有草稿可以修改',409);
  const v=validate(data), t=now();
  await env.DB.prepare(`UPDATE invoices SET document_type=?,customer_name=?,customer_company=?,customer_phone=?,customer_email=?,customer_address=?,issue_date=?,due_date=?,subtotal_cents=?,discount_cents=?,tax_rate=?,tax_cents=?,total_cents=?,notes=?,terms=?,source_order_id=?,updated_at=? WHERE id=? AND status='draft'`)
    .bind(v.type,v.name,v.company,v.phone,v.email,v.address,v.issueDate,v.dueDate,v.subtotal,v.discount,v.taxRate,v.tax,v.total,v.notes,v.terms,v.sourceOrderId,t,id).run();
  await env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id=?').bind(id).run();
  for(let i=0;i<v.items.length;i++){const x=v.items[i];await env.DB.prepare('INSERT INTO invoice_items(invoice_id,position,description,quantity,unit_price_cents,amount_cents) VALUES(?,?,?,?,?,?)').bind(id,i+1,x.description,x.quantity,x.unit,x.amount).run();}
  await event(env,id,'updated',`total=${money(v.total)}`);
  return publicRow(await loadFull(env,'id',id),env);
}

export async function invoiceAction(env,id,action) {
  const row=await loadFull(env,'id',id); if(!row)throw new InvoiceError('找不到这张单据',404);
  const t=now(); let status, extra='';
  if(action==='issue'&&row.status==='draft'){status='issued';extra=',issued_at=?'}
  else if(action==='paid'&&['issued','draft'].includes(row.status)){status='paid';extra=',issued_at=COALESCE(issued_at,?),paid_at=?'}
  else if(action==='cancel'&&row.status!=='cancelled'){status='cancelled';extra=',cancelled_at=?'}
  else throw new InvoiceError('这张单据目前不能执行该操作',409);
  const values=action==='paid'?[status,t,t,t,id]:[status,t,t,id];
  const sql=action==='paid'?`UPDATE invoices SET status=?${extra},updated_at=? WHERE id=?`:`UPDATE invoices SET status=?${extra},updated_at=? WHERE id=?`;
  await env.DB.prepare(sql).bind(...values).run();
  await event(env,id,action,`before=${row.status} after=${status}`);
  return publicRow(await loadFull(env,'id',id),env);
}

export async function deleteInvoice(env,id) {
  const row=await loadFull(env,'id',id); if(!row)throw new InvoiceError('找不到这张单据',404);
  if(row.status!=='draft')throw new InvoiceError('只有草稿可以删除',409);
  await env.DB.prepare('DELETE FROM invoice_events WHERE invoice_id=?').bind(id).run();
  await env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id=?').bind(id).run();
  await env.DB.prepare('DELETE FROM invoices WHERE id=?').bind(id).run();
  return {ok:true};
}

export async function listInvoices(env,url) {
  await ensureInvoiceTables(env);
  const q=cleanText(url.searchParams.get('q'),100), status=cleanText(url.searchParams.get('status'),20), binds=[], filters=[];
  if(status){if(!STATUSES.has(status))throw new InvoiceError('状态不正确');filters.push('status=?');binds.push(status)}
  if(q){filters.push('(invoice_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR source_order_id LIKE ?)');binds.push(...Array(4).fill(`%${q}%`))}
  const where=filters.length?'WHERE '+filters.join(' AND '):'';
  const rows=(await env.DB.prepare(`SELECT * FROM invoices ${where} ORDER BY id DESC LIMIT 300`).bind(...binds).all()).results;
  const counts=(await env.DB.prepare('SELECT status,COUNT(*) n,COALESCE(SUM(total_cents),0) amount FROM invoices GROUP BY status').all()).results;
  const stats={total:0,draft:0,issued:0,paid:0,cancelled:0,paid_amount:'0.00'};
  for(const x of counts){stats[x.status]=x.n;stats.total+=x.n;if(x.status==='paid')stats.paid_amount=money(x.amount)}
  return {invoices:rows.map(x=>publicRow(x,env)),stats};
}

export async function getInvoice(env,id){const row=await loadFull(env,'id',id);if(!row)throw new InvoiceError('找不到这张单据',404);return publicRow(row,env)}
export async function findPublicInvoice(env,publicId){const id=cleanText(publicId,80);if(!/^[a-f0-9]{40}$/i.test(id))return null;const row=await loadFull(env,'public_id',id);if(!row||row.status==='draft')return null;return publicRow(row,env)}

function publicRow(row,env){
  const base=(env.PUBLIC_BASE_URL||'https://aligor.aligor.workers.dev').replace(/\/$/,'');
  return {...row,subtotal:money(row.subtotal_cents),discount:money(row.discount_cents),tax:money(row.tax_cents),total:money(row.total_cents),public_url:`${base}/invoice/${row.public_id}`,items:row.items?.map(x=>({...x,unit_price:money(x.unit_price_cents),amount:money(x.amount_cents)}))};
}

export async function invoiceCsv(env){
  await ensureInvoiceTables(env);const rows=(await env.DB.prepare('SELECT * FROM invoices ORDER BY id').all()).results;
  const cols=['invoice_no','document_type','status','customer_name','customer_company','customer_phone','customer_email','issue_date','due_date','currency','subtotal','discount','tax_rate','tax','total','source_order_id','issued_at','paid_at','created_at'];
  const mapped=rows.map(r=>({...r,subtotal:money(r.subtotal_cents),discount:money(r.discount_cents),tax:money(r.tax_cents),total:money(r.total_cents)}));
  return '\ufeff'+[cols.join(','),...mapped.map(r=>cols.map(c=>csvEscape(r[c])).join(','))].join('\n');
}
