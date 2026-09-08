const { copilotService } = require('./dist/services/copilot.service.js');

async function runTest() {
  const result = await copilotService.processChat({
    message: 'Make point 2 bold',
    context: {
      templateTitle: 'Hindu Marriage Act Sec 13B Petition',
      documentBody: '<p style="text-align: center;"><b>हिंदू विवाह कायदा १९५५ चे कलम १३(ब)</b></p><p>१) अर्जदार क्रमांक १ नितीन महाजन</p><p>२) विवाह दिनांक ०१/०५/२०२१ रोजी पार पडला.</p>'
    },
    apiKey: process.env.GEMINI_API_KEY
  });
  console.log('--- PROCESS CHAT RESULT ---');
  console.log(result);
}

runTest();

