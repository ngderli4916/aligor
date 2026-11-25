"""Two-day WhatsApp delivery. Existing receiver invokes this module for its own event only."""
import fcntl
import hashlib
import json
import re
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

STATE = Path.home() / '.hermes/state/aligor-two-day-signups'
LOOKUP = 'https://aligorvibe.com/api/internal/2days-botsclass/notice'
EVENT = 'aligor.two-day-registration.created'
REFERENCE = re.compile(r'2D-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}')
PHONE = re.compile(r'601[0-9]{8,9}')
JASON_JID = '60175659153@s.whatsapp.net'
ALIGOR_SENDER_JID = '60167871902@s.whatsapp.net'  # Linked to SpiderMan; do not send to the sending account.


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def lookup(reference, secret):
    request = urllib.request.Request(LOOKUP, data=json.dumps({'reference':reference}).encode(),
        headers={'Content-Type':'application/json','Authorization':'Bearer '+secret,
                 'User-Agent':'Aligor-Partner-Receiver/1.0'}, method='POST')
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=8) as response:
            return json.loads(response.read(16385))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def valid_notice(row, reference, floor):
    if not isinstance(row, dict) or set(row) != {'reference','createdAt','phone','customer','partner'} or row['reference'] != reference:
        return False
    if not isinstance(row['phone'], str) or not PHONE.fullmatch(row['phone']):
        return False
    if not isinstance(row['createdAt'], str) or datetime.fromisoformat(row['createdAt'].replace('Z','+00:00')) < floor:
        return False
    return all(isinstance(row[k],str) and 0<len(row[k])<=1800 and reference in row[k] for k in ('customer','partner'))


def ledger(path):
    db=sqlite3.connect(path)
    db.execute('CREATE TABLE IF NOT EXISTS sends (reference TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL, mid TEXT, digest TEXT NOT NULL, PRIMARY KEY(reference,channel))')
    return db


def send_wa(to, message):
    from partner_signup_notice import wa
    d=wa('send','text','--to',to,'--no-preview','--message',message)
    mid=d.get('message_id') or d.get('messageId') or d.get('id') or d.get('MsgID')
    return mid if isinstance(mid,str) and re.fullmatch(r'[A-Za-z0-9]+',mid) else None


def verify_wa(to, mid, text):
    from partner_signup_notice import wa
    try:
        d=wa('--read-only','messages','show','--chat',to,'--id',mid,'--full')
    except Exception:
        return False
    return d.get('ChatJID')==to and d.get('MsgID')==mid and d.get('FromMe') is True and d.get('Text')==text


def deliver_one(db, reference, channel, to, message, send, verify):
    digest=hashlib.sha256((to+'\0'+message).encode()).hexdigest()
    prior=db.execute('SELECT status,mid,digest FROM sends WHERE reference=? AND channel=?',(reference,channel)).fetchone()
    if prior:
        status, mid, old=prior
        if status=='verified':
            return 200
        if not mid or old!=digest:
            return 409
    else:
        with db:
            db.execute("INSERT INTO sends VALUES (?,?,'uncertain',NULL,?)",(reference,channel,digest))
        try:
            mid=send(to,message)
        except Exception:
            return 409
        if not mid:
            return 409
        with db:
            db.execute("UPDATE sends SET status='accepted',mid=? WHERE reference=? AND channel=?",(mid,reference,channel))
    if not verify(to,mid,message):
        return 503  # A redelivered event verifies the same MID; never sends it again.
    with db:
        db.execute("UPDATE sends SET status='verified' WHERE reference=? AND channel=?",(reference,channel))
    return 200


def deliver(reference, secret, state=STATE, load=lookup, send=send_wa, verify=verify_wa):
    if not REFERENCE.fullmatch(reference) or not secret:
        return 400
    config=state/'scope.json'
    if not config.is_file():
        return 503
    scope=json.loads(config.read_text())
    if scope.get('partner')!=JASON_JID or scope.get('sender')!='spiderman':
        return 503
    floor=datetime.fromisoformat(scope['notBefore'].replace('Z','+00:00'))
    if floor.tzinfo is None:
        return 503
    row=load(reference,secret)
    if row is None or not valid_notice(row,reference,floor):
        return 404
    with (state/'run.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        db=ledger(state/'delivery.sqlite3')
        try:
            customer=row['phone']+'@s.whatsapp.net'
            if customer==ALIGOR_SENDER_JID:
                # Do not resend old ambiguous attempts; the customer still gets the payment panel on the page.
                digest=hashlib.sha256((customer+'\0'+row['customer']).encode()).hexdigest()
                with db:
                    db.execute("INSERT OR IGNORE INTO sends VALUES (?,'customer','skipped_self',NULL,?)",(reference,digest))
                customer_status=200
            elif customer==JASON_JID:
                # Do not deliver two messages to a reserved partner number.
                customer_status=409
            else:
                customer_status=deliver_one(db,reference,'customer',customer,row['customer'],send,verify)
            partner_status=deliver_one(db,reference,'partner',JASON_JID,row['partner'],send,verify)
        finally:
            db.close()
    return 503 if 503 in (customer_status,partner_status) else 409 if 409 in (customer_status,partner_status) else 200
