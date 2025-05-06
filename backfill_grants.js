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

function extractAmount(text) {
  const regex = /\$([\d,]+(?:\.\d+)?)(?:\s*(million|billion|thousand|k|m|b))?/i;
  const match = text.match(regex);
  if (!match) return null;
  let amount = parseFloat(match[1].replace(/,/g, ''));
  const unit = match[2]?.toLowerCase();
  if (unit === 'billion' || unit === 'b') amount *= 1_000_000_000;
  else if (unit === 'million' || unit === 'm') amount *= 1_000_000;
  else if (unit === 'thousand' || unit === 'k') amount *= 1_000;
  return `$${amount.toLocaleString()}`;
}

function determineCategories(text) {
  const categories = [];
  const lowerText = text.toLowerCase();
  const categoryMap = {
    'Technology': ['tech', 'software', 'hardware', 'digital'],
    'Healthcare': ['health', 'medicine', 'clinical'],
    'Environment': ['climate', 'sustainability', 'green', 'energy'],
    'Education': ['school', 'education', 'university'],
    'Research': ['research', 'study', 'investigation'],
    'Social': ['community', 'welfare', 'nonprofit'],
    'Arts': ['culture', 'museum', 'creative'],
    'Agriculture': ['agriculture', 'farming', 'food']
  };
  for (const [cat, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(k => lowerText.includes(k))) {
      categories.push(cat);
    }
  }
  return categories.length > 0 ? categories : ['Other'];
}

async function run() {
  const { data: grants, error } = await supabase
    .from('grants')
    .select('id, body, eligibility_text, deadline, amount, category')
    .or('eligibility_text.is.null,deadline.is.null,amount.is.null,category.is.null')
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
    const amount = g.amount || extractAmount(body);
    const category = g.category && g.category.length > 0 ? g.category : determineCategories(body);

    console.log(`🔍 Grant ${g.id}:`, { deadline, eligibility, amount, category });

    if (deadline || eligibility || amount || (category && category.length > 0)) {
      const { error: updateError } = await supabase
        .from('grants')
        .update({ deadline, eligibility_text: eligibility, amount, category })
        .eq('id', g.id);

      if (updateError) {
        console.error(`❌ Error updating grant ${g.id}:`, updateError.message);
      } else {
        updated++;
      }
    }
  }

  console.log(`✅ Backfilled ${updated} grants.`);
}

(async () => {
  await run();
})();
