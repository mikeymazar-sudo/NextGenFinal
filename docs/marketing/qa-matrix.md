# QA Matrix

## Auth and ownership

| Scenario | Expected result |
| --- | --- |
| Read marketing data for another user's property | Request is rejected |
| Launch campaign with contact from another property | Enrollment is ineligible with ownership reason |
| Patch a call with a property you do not own | Request is rejected |

## Suppression and consent

| Scenario | Expected result |
| --- | --- |
| SMS destination exists in global suppression | Enrollment is excluded before launch |
| Email destination unsubscribed | Send is blocked and review surface explains why |
| Inbound STOP message arrives | SMS suppression row is created and thread is updated |

## Audience and imports

| Scenario | Expected result |
| --- | --- |
| CSV import with duplicate rows | Duplicate audience records are prevented or marked |
| CSV import with phone and email data | Contact and enrollment rows are usable in campaigns |
| Imported row lacks a usable destination | Enrollment is created with explicit ineligible state |

## Review-first flow

| Scenario | Expected result |
| --- | --- |
| Draft saved before review | Campaign remains `draft` |
| Review run finds suppressions and invalid targets | User sees counts and reasons before launch |
| Launch after approval | Campaign transitions to launch status and creates execution rows |
| Partial launch failure | Campaign and enrollments surface partial-failure state |

## Unified inbox

| Scenario | Expected result |
| --- | --- |
| SMS send and reply | Thread shows outbound then inbound events and needs-reply state |
| Email send with property context | Thread shows email event and normalized status |
| Voicemail drop with recording | Thread shows voicemail event, outcome, and recording metadata |
| Note added after communication | Note appears in the same thread timeline |

## Analytics

| Scenario | Expected result |
| --- | --- |
| Delivered SMS count | Matches normalized delivered status |
| Answered voice count | Matches normalized answered status |
| Voicemail left count | Matches normalized voicemail-left status |
| Converted count | Reflects converted enrollments without double counting |

## UI consistency

| Scenario | Expected result |
| --- | --- |
| Desktop navigation | Includes `Marketing` and matches mobile route set |
| Mobile navigation | Includes `Marketing` and retains active-state behavior |
| Empty builder or inbox state | Clear next action is visible |
| Narrow mobile viewport | No horizontal overflow; primary actions remain accessible |
