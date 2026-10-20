from datetime import datetime, timezone
import unittest
from alert_rules import validate_rules, allowed, critical

def stamp(value): return datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp()
class RuleTests(unittest.TestCase):
    def test_overnight_and_daytime_windows_use_account_timezone(self):
        rules = validate_rules({'quietEnabled':True,'timezone':'America/Los_Angeles'})
        self.assertFalse(allowed(rules, {'priority':3}, stamp('2026-10-20T06:00:00')))
        self.assertTrue(allowed(rules, {'priority':3}, stamp('2026-10-20T16:00:00')))
        rules.update(start='09:00',end='17:00')
        self.assertFalse(allowed(rules, {}, stamp('2026-10-20T16:00:00')))
        self.assertTrue(allowed(rules, {}, stamp('2026-10-21T01:00:00')))
    def test_dst_fallback_and_spring_forward_follow_local_wall_clock(self):
        rules=validate_rules({'quietEnabled':True,'timezone':'America/Los_Angeles','start':'01:00','end':'03:00'})
        for value in ('2026-11-01T08:30:00','2026-11-01T09:30:00','2026-03-08T09:30:00'):
            self.assertFalse(allowed(rules,{},stamp(value)))
        self.assertTrue(allowed(rules,{},stamp('2026-03-08T10:01:00')))
    def test_critical_priority_can_bypass_quiet_hours_and_muted_topics(self):
        rules=validate_rules({'quietEnabled':True,'mutedTopics':['apps']})
        self.assertTrue(allowed(rules,{'topic':'apps','priority':5},stamp('2026-10-20T23:00:00')))
        rules['criticalBypass']=False
        self.assertFalse(allowed(rules,{'topic':'apps','priority':5},stamp('2026-10-20T23:00:00')))
        self.assertFalse(critical(rules,{'priority':5}))
    def test_validation_rejects_bad_values(self):
        for value in ({'timezone':'Mars/Unknown'},{'quietEnabled':'true'},{'start':'25:00'},
                      {'groupSeconds':True},{'groupSeconds':3601},{'mutedTopics':['../other']},
                      {'quietEnabled':True,'start':'12:00','end':'12:00'},{'owner':'other'}):
            with self.subTest(value=value),self.assertRaises(ValueError):validate_rules(value)
