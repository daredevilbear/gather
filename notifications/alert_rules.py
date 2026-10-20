"""Validated, account-scoped delivery rules. Inbox retention is independent of delivery."""
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import re

DEFAULT_RULES = {'quietEnabled': False, 'start': '22:00', 'end': '07:00',
                 'timezone': 'UTC', 'mutedTopics': [], 'criticalBypass': True,
                 'criticalPriority': 5, 'groupSeconds': 0}

def validate_rules(value):
    if not isinstance(value, dict) or set(value) - set(DEFAULT_RULES):
        raise ValueError('Invalid alert rules')
    rules = {**DEFAULT_RULES, **value}
    for key in ('quietEnabled', 'criticalBypass'):
        if type(rules[key]) is not bool:
            raise ValueError('Invalid alert rule flag')
    for key in ('start', 'end'):
        if not isinstance(rules[key], str) or not re.fullmatch(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]', rules[key]):
            raise ValueError('Invalid quiet hours')
    if rules['quietEnabled'] and rules['start'] == rules['end']:
        raise ValueError('Quiet hours must have different start and end times')
    if not isinstance(rules['timezone'], str) or len(rules['timezone']) > 80:
        raise ValueError('Invalid timezone')
    try:
        ZoneInfo(rules['timezone'])
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError('Unknown timezone') from None
    if not isinstance(rules['mutedTopics'], list) or len(rules['mutedTopics']) > 50 or any(
        not isinstance(topic, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', topic) for topic in rules['mutedTopics']):
        raise ValueError('Invalid topic preferences')
    if type(rules['criticalPriority']) is not int or not 1 <= rules['criticalPriority'] <= 5:
        raise ValueError('Invalid critical priority')
    if type(rules['groupSeconds']) is not int or not 0 <= rules['groupSeconds'] <= 3600:
        raise ValueError('Invalid grouping window')
    return rules

def critical(rules, message):
    return rules['criticalBypass'] and message.get('priority', 3) >= rules['criticalPriority']

def allowed(rules, message, timestamp):
    if critical(rules, message):
        return True
    if message.get('topic') in rules['mutedTopics']:
        return False
    if not rules['quietEnabled']:
        return True
    current = datetime.fromtimestamp(timestamp, ZoneInfo(rules['timezone'])).strftime('%H:%M')
    start, end = rules['start'], rules['end']
    quiet = start <= current < end if start < end else current >= start or current < end
    return not quiet
