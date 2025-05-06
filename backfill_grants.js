// backfill_grants.js with GPT-4 extraction
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractWithGPT(bodyText) {
  if (!bodyText || bodyText.length < 20) return {};
  const prompt = `Extract the following fields from this grant description:
- Deadline (in YYYY-MM-DD)
- Eligibility
- Amount (in plain text like "$100,000" or "$2 million")
- Categories (as a list of relevant topics like Technology, Education, etc.)

Respond in valid JSON format with keys: deadline, eligibility, amount, category

Grant Description:
"""
${bodyText.slice(0, 4000)}
"""`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a structured data extractor.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    });

    const text = completion.choices[0].message.content.trim();
    const json = JSON.parse(text);
    return {
      deadline: json.deadline || null,
      eligibility: json.eligibility || null,
      amount: json.amount || null,
      category: Array.isArray(json.category) ? json.category : []
    };
  } catch (e) {
    console.warn('⚠️ GPT extraction error:', e.message);
    return {};
  }
}

async function run() {
  const { data: grants, error } = await supabase
    .from('grants')
    .select('id, body, eligibility_text, deadline, amount, category')
    .or('eligibility_text.is.null,deadline.is.null,amount.is.null,category.is.null')
    .limit(20); // limit to avoid hitting token or rate limits

  if (error) {
    console.error('❌ Error fetching grants:', error.message);
    return;
  }

  let updated = 0;
  for (const g of grants) {
    const body = g.body || '';
    const result = await extractWithGPT(body);

    console.log(`🔍 Grant ${g.id}:`, result);

    if (result.deadline || result.eligibility || result.amount || (result.category && result.category.length > 0)) {
      const { error: updateError } = await supabase
        .from('grants')
        .update({
          deadline: result.deadline,
          eligibility_text: result.eligibility,
          amount: result.amount,
          category: result.category
        })
        .eq('id', g.id);

      if (updateError) {
        console.error(`❌ Error updating grant ${g.id}:`, updateError.message);
      } else {
        updated++;
      }
    }
  }

  console.log(`✅ Backfilled ${updated} grants using GPT.`);
}

(async () => {
  await run();
})();
