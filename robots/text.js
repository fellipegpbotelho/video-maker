const algorithmia = require('algorithmia');
const sentenceBoundaryDetection = require('sbd');
const NaturalLanguageUnderstandingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js');
const algorithmiaApiKey = require('../credentials/algorithmia.json').apiKey;
const watsonApiKey = require('../credentials/watson-nlu.json').apikey;

const nlu = new NaturalLanguageUnderstandingV1({
  iam_apikey: watsonApiKey,
  version: '2018-04-05',
  url: 'https://gateway.watsonplatform.net/natural-language-understanding/api/'
});

async function fetchContentFromWikipedia(content) {
  const algorithmiaAuthenticated = algorithmia(algorithmiaApiKey);
  const wikipediaAlgorithm = algorithmiaAuthenticated.algo('web/WikipediaParser/0.1.2');
  const wikipediaResponse = await wikipediaAlgorithm.pipe(content.searchTerm);
  const wikipediaContent = wikipediaResponse.get();

  content.sourceContentOriginal = wikipediaContent.content;

  return content;
}

function removeBlankLinesAndMarkdown(text) {
  const allLines = text.split('\n');

  const withoutBlankLinesAndMarkdown = allLines.filter(line => {
    if (line.trim().length === 0 || line.trim().startsWith('=')) {
      return false;
    }

    return true;
  });

  return withoutBlankLinesAndMarkdown.join(' ');
}

function removeDatesInParentheses(text) {
  return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, '').replace(/ {2}/g, ' ');
}

function sanitizeContent(content) {
  const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkdown(content.sourceContentOriginal);
  const withoutDatesInParentheses = removeDatesInParentheses(withoutBlankLinesAndMarkdown);

  content.sourceContentSanitized = withoutDatesInParentheses;

  return content;
}

function breakContentIntoSentences(content) {
  content.sentences = [];

  const sentences = sentenceBoundaryDetection.sentences(content.sourceContentSanitized);

  sentences.forEach(sentence => {
    content.sentences.push({
      text: sentence,
      keywords: [],
      images: []
    });
  });

  return content;
}

async function fetchWatsonAndReturnKeywords(sentence) {
  return new Promise((resolve, reject) => {
    nlu.analyze(
      {
        text: sentence,
        features: {
          keywords: {}
        }
      },
      (error, response) => {
        if (error) {
          reject(error);
        }
        const keywords = response.keywords.map(keyword => {
          return keyword.text;
        });
        resolve(keywords);
      }
    );
  });
}

function limitMaximunSentences(content) {
  content.sentences = content.sentences.slice(0, content.maximumSentences);

  return content;
}

async function fetchKeywordsOfAllSentences(content) {
  for (const sentence of content.sentences) {
    sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text);
  }

  return content;
}

async function robot(content) {
  await fetchContentFromWikipedia(content);
  sanitizeContent(content);
  breakContentIntoSentences(content);
  limitMaximunSentences(content);
  await fetchKeywordsOfAllSentences(content);
}

module.exports = robot;
