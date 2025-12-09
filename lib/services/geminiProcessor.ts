import type { ScrapedJob } from './freeJobFetcher';

export interface GeminiJobAnalysis {
  isPhD: boolean;
  fundingType: string;
  deadline: string | null; // ISO date or null
  tags: string[];
}

export async function analyzeJobWithGemini(
  job: ScrapedJob
): Promise<GeminiJobAnalysis> {
  const text = `${job.title}\n${job.rawText}`.toLowerCase();

  const isPhD = /phd|ph\.d|doctoral|doctorate/.test(text);

  let fundingType = 'Unknown';
  if (/fully funded|full funding|tuition waiver/.test(text)) {
    fundingType = 'Fully funded';
  } else if (/scholarship|fellowship|stipend/.test(text)) {
    fundingType = 'Stipend/Scholarship';
  } else if (/salary|paid position|competitive compensation/.test(text)) {
    fundingType = 'Salary';
  }

  const tags = new Set<string>();

  if (/computer science|machine learning|ai|artificial intelligence/.test(text)) {
    tags.add('Computer Science');
    tags.add('AI / Machine Learning');
  }
  if (/data science|data analysis|data analytics/.test(text)) {
    tags.add('Data Science');
  }
  if (/climate|environment|sustainability/.test(text)) {
    tags.add('Climate');
  }
  if (/remote/.test(text)) {
    tags.add('Remote');
  }
  if (/europe|germany|denmark|italy|france|spain|netherlands|sweden|norway|finland/.test(text)) {
    tags.add('Europe');
  }

  if (tags.size === 0) {
    tags.add('Research');
  }

  return {
    isPhD,
    fundingType,
    deadline: null,
    tags: Array.from(tags),
  };
}
