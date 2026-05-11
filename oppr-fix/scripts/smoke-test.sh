#!/usr/bin/env bash
# End-to-end smoke test against the live ohiopride.org volunteer-submit
# function. Run AFTER deploying this patch and applying the two migrations.
#
# Usage:  bash scripts/smoke-test.sh
# Override the endpoint if you want to test a deploy preview:
#   ENDPOINT=https://deploy-preview-XX--ohiopride.netlify.app/.netlify/functions/volunteer-submit \
#     bash scripts/smoke-test.sh

set -u
ENDPOINT="${ENDPOINT:-https://ohiopride.org/.netlify/functions/volunteer-submit}"
STAMP=$(date +%s)
FAILS=0

echo "Endpoint: $ENDPOINT"
echo "Stamp:    $STAMP"
echo

echo "[1] Volunteer submission"
VOL=$(curl -s -w '\n%{http_code}' -X POST "$ENDPOINT" \
  -H 'content-type: application/json' \
  -d "{\"application_type\":\"volunteer\",\"first_name\":\"SmokeTest\",\"last_name\":\"Volunteer $STAMP\",\"email\":\"smoke+vol+$STAMP@ohiopride.test\",\"phone\":\"513-555-0100\",\"pronouns\":\"they/them\",\"city\":\"Cincinnati\",\"county\":\"Hamilton\",\"zip\":\"45202\",\"registered_voter\":\"yes\",\"interests\":[\"field_canvassing\",\"phone_text_banking\"],\"skills\":[\"writing\"],\"availability\":[\"weekends\"],\"time_commitment\":\"monthly\",\"is_founding_member\":false,\"email_optin\":true,\"sms_optin\":false,\"additional_notes\":\"Smoke test row $STAMP\"}")
V_CODE=$(echo "$VOL" | tail -1)
V_BODY=$(echo "$VOL" | sed '$d')
echo "   HTTP $V_CODE — $V_BODY"
echo "$V_BODY" | grep -q '"ok":true' || { echo "   FAIL"; FAILS=$((FAILS+1)); }
echo

echo "[2] Intern submission"
INT=$(curl -s -w '\n%{http_code}' -X POST "$ENDPOINT" \
  -H 'content-type: application/json' \
  -d "{\"application_type\":\"internship\",\"first_name\":\"SmokeTest\",\"last_name\":\"Intern $STAMP\",\"email\":\"smoke+intern+$STAMP@ohiopride.test\",\"phone\":\"513-555-0101\",\"pronouns\":\"she/her\",\"city\":\"Columbus\",\"county\":\"Franklin\",\"zip\":\"43215\",\"position\":\"legislative_director\",\"term\":\"summer_2026\",\"weekly_hours\":12,\"credit_hours\":3,\"institution\":\"The Ohio State University\",\"program_major\":\"Political Science\",\"class_year\":\"Senior\",\"resume_url\":\"https://example.com/smoke-resume.pdf\",\"statement_of_interest\":\"Smoke test statement of interest. Please ignore.\",\"prior_experience\":\"Two years student government.\",\"why_ohio_pride\":\"Smoke test record.\",\"email_optin\":true}")
I_CODE=$(echo "$INT" | tail -1)
I_BODY=$(echo "$INT" | sed '$d')
echo "   HTTP $I_CODE — $I_BODY"
echo "$I_BODY" | grep -q '"ok":true' || { echo "   FAIL"; FAILS=$((FAILS+1)); }
echo

if [ "$FAILS" -eq 0 ]; then
  echo "ALL CHECKS PASSED — log into /admin/volunteers and /admin/internships to see the rows."
  echo "Smoke test emails:"
  echo "  smoke+vol+$STAMP@ohiopride.test"
  echo "  smoke+intern+$STAMP@ohiopride.test"
  exit 0
else
  echo "$FAILS CHECK(S) FAILED — see the JSON above for the supabase code/message."
  echo "Most common: code 42501 means SUPABASE_SERVICE_ROLE_KEY on Netlify is wrong."
  echo "             code 42P01 means the migrations haven't been applied yet."
  exit 1
fi
