// pages/api/pdf-debug.js (Pages Router)
import multer from 'multer';
import pdfParse from 'pdf-parse';

export const config = {
  api: {
    bodyParser: false,
  },
};

const upload = multer({ storage: multer.memoryStorage() });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Use pdf-parse with a custom pagerender function to extract text with positions
      const options = {
        pagerender: async (pageData) => {
          const textContent = await pageData.getTextContent();
          const items = textContent.items.map((item) => ({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
            page: pageData.pageNumber,
          }));
          return items;
        },
      };

      const data = await pdfParse(req.file.buffer, options);
      
      // Flatten all text items from all pages into a single array of blocks
      const blocks = [];
      for (const pageItems of data.pages) {
        for (const item of pageItems) {
          blocks.push({
            text: item.text,
            color: '#cccccc', // dummy colour, keep as is for mapping modal
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            page: item.page,
          });
        }
      }

      res.status(200).json(blocks);
    });
  } catch (error) {
    console.error('PDF extraction error:', error);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
}