import json
import tempfile
import unittest
from pathlib import Path
import partner_signup_webhook as endpoint
import two_day_signup_notice as notice


class TwoDayTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state=Path(self.temp.name)
        self.ref='2D-ABC234'
        self.secret='test-secret'
        self.events=[]
        self.row=dict(reference=self.ref,createdAt='2026-11-26T00:02:00Z',phone='60100000148',customer='付款 '+self.ref,partner='待付款 '+self.ref)
        (self.state/'scope.json').write_text(json.dumps(dict(partner=notice.JASON_JID,sender='spiderman',notBefore='2026-11-26T00:00:00Z')))

    def dispatch(self,reference,secret,send=None,verify=None):
        self.assertEqual(self.secret,secret)
        def accepted(to,text):
            self.events.append((to,text))
            return 'fakeMid'+str(len(self.events))
        return notice.deliver(reference,secret,self.state,lambda r,s:self.row,send or accepted,verify or (lambda *a:True))

    def handle(self,auth='Bearer test-secret',data=None):
        return endpoint.handle(auth,self.secret,json.dumps(data if data is not None else dict(event=notice.EVENT,reference=self.ref)).encode(),lambda i:200 if i==1234 else 400,self.dispatch)

    def test_routing_auth_transfer_and_idempotence(self):
        self.assertEqual(self.handle('Bearer wrong'),401)
        self.assertEqual(self.handle(data=dict(event=notice.EVENT,reference=self.ref,to='override')),400)
        self.assertEqual(self.handle(data=dict(event=notice.EVENT,reference='../../other')),400)
        self.assertEqual(self.handle(data=dict(event=endpoint.EVENT,leadId=1234)),200)
        self.assertFalse(self.events)
        self.assertEqual(self.handle(),200)
        self.assertEqual(self.handle(),200)
        self.assertEqual(self.events,[('60100000148@s.whatsapp.net',self.row['customer']),(notice.JASON_JID,self.row['partner'])])

    def test_not_activated_and_no_replay(self):
        self.row['createdAt']='2026-11-25T00:00:00Z'
        self.assertEqual(self.handle(),404)
        (self.state/'scope.json').unlink()
        self.assertEqual(self.handle(),503)
        self.assertFalse(self.events)

    def test_transport_failure_does_not_block_jason_or_blindly_resend(self):
        def send(to,text):
            self.events.append(to)
            if to!=notice.JASON_JID: raise RuntimeError('unknown transport outcome')
            return 'fakeMID'
        self.assertEqual(self.dispatch(self.ref,self.secret,send),409)
        self.assertEqual(self.dispatch(self.ref,self.secret,send),409)
        self.assertEqual(self.events,['60100000148@s.whatsapp.net',notice.JASON_JID])

    def test_pending_verification_reuses_message_id_without_sending(self):
        self.assertEqual(self.dispatch(self.ref,self.secret,verify=lambda *a:False),503)
        self.assertEqual(self.dispatch(self.ref,self.secret),200)
        self.assertEqual(len(self.events),2)

    def test_customer_cannot_trigger_two_messages_to_jason(self):
        self.row['phone']=notice.JASON_JID.split('@')[0]
        self.assertEqual(self.handle(),409)
        self.assertEqual(self.events,[(notice.JASON_JID,self.row['partner'])])


if __name__=='__main__': unittest.main()
