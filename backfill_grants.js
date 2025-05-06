// backfill_grants.js
const { createClient } = require('@supabase/supabase-js');
const { XMLParser } = require('fast-xml-parser');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function extractDeadline(text) {
  const deadlineRegex = /deadline[:\s]*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i;
  const match = text.match(deadlineRegex);
  if (match && match[1]) {
    try {
      return new Date(match[1]).toISOString().split('T')[0];
    } catch (e) {
      return null;
    }
  }
  return null;
}

function extractEligibility(text) {
  const regex = /eligibility[:\s]*([^.\n]+)/i;
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function extractDuration(text) {
  const regex = /duration[:\s]*([^.\n]+)/i;
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

async function run() {
  const { data: grants, error } = await supabase
    .from('grants')
    .select('id, body, deadline, eligibility_text, duration')
    .or('deadline.is.null,eligibility_text.is.null,duration.is.null')
    .limit(500);

  if (error) {
    console.error('❌ Error fetching grants:', error.message);
    return;
  }

  let updated = 0;
  for (const g of grants) {
    const body = g.body || '';
    const deadline = g.deadline || extractDeadline(body);
    const eligibility = g.eligibility_text || extractEligibility(body);
    const duration = g.duration || extractDuration(body);

    const { error: updateError } = await supabase
      .from('grants')
      .update({ deadline, eligibility_text: eligibility, duration })
      .eq('id', g.id);

    if (updateError) {
      console.error(`❌ Error updating grant ${g.id}:`, updateError.message);
    } else {
      updated++;
    }
  }

  console.log(`✅ Backfilled ${updated} grants.`);
}

(async () => {
  await run();
})();

