"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuturePdfLib = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const pdf_lib_1 = require("pdf-lib");
const buffer_1 = require("buffer");
const fs = __importStar(require("fs"));
class FuturePdfLib {
    constructor() {
        this.description = {
            displayName: 'Future PDF-LIB',
            name: 'FuturePdfLib',
            icon: 'file:PdfLib.svg',
            group: ['transform'],
            version: 1,
            description: 'Perform operations on PDF files (get info, split)',
            defaults: {
                name: 'PDF-LIB',
            },
            inputs: ['main'],
            outputs: ['main'],
            usableAsTool: true,
            properties: [
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        {
                            name: 'Get PDF Info',
                            value: 'getInfo',
                            description: 'Extract information from a PDF file',
                            action: 'Get information from a PDF file',
                        },
                        {
                            name: 'Split PDF',
                            value: 'split',
                            description: 'Split a PDF into chunks of pages',
                            action: 'Split a PDF into chunks of pages',
                        },
                        {
                            name: 'Code PDF-LIB',
                            value: 'code',
                            description: 'Execute custom code for PDF-LIB operations',
                            action: 'Execute custom code for PDF-LIB operations'
                        }
                    ],
                    default: 'getInfo',
                },
                {
                    displayName: 'Binary Property',
                    name: 'binaryPropertyName',
                    type: 'string',
                    default: 'data',
                    description: 'Name of the binary property containing the PDF file',
                    displayOptions: {
                        show: {
                            operation: ['getInfo', 'split', 'code'],
                        },
                    },
                },
                {
                    displayName: 'Chunk Size',
                    name: 'chunkSize',
                    type: 'number',
                    default: 1,
                    description: 'Number of pages per chunk',
                    displayOptions: {
                        show: {
                            operation: ['split'],
                        },
                    },
                },
                {
                    displayName: 'PDF-LIB Direct',
                    name: 'pdf-code',
                    type: 'string',
                    typeOptions: {
                        editor: 'codeNodeEditor',
                        editorLanguage: 'javaScript',
                        rows: 20,
                    },
                    default: "",
                    description: 'Direct Code Input for PDF-LIB',
                    displayOptions: {
                        show: {
                            operation: ['code'],
                        },
                    },
                }
            ],
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            let pdfDoc;
            let fileBytes;
            let debugInfo = {};
            try {
                const operation = this.getNodeParameter('operation', itemIndex);
                const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data');
                const item = items[itemIndex];
                if (!item.binary || !item.binary[binaryPropertyName]) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `No binary data property '${binaryPropertyName}' found on item`, { itemIndex });
                }
                try {
                    const binaryData = item.binary[binaryPropertyName];
                    const filePath = `${binaryData.directory}/${binaryData.fileName}`;
                    fileBytes = fs.readFileSync(filePath);
                    pdfDoc = await pdf_lib_1.PDFDocument.load(fileBytes, { ignoreEncryption: true });
                }
                catch (filesystemError) {
                    try {
                        fileBytes = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
                        pdfDoc = await pdf_lib_1.PDFDocument.load(fileBytes, { ignoreEncryption: true });
                    }
                    catch (binaryError) {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to load PDF from both filesystem and binary data. Filesystem error: ${filesystemError.message}, Binary error: ${binaryError.message}`, { itemIndex });
                    }
                }
                switch (operation) {
                    case 'getInfo':
                        const pageCount = pdfDoc.getPageCount();
                        returnData.push({
                            json: {
                                pageCount,
                                operation: 'getInfo',
                                fileName: item.binary[binaryPropertyName].fileName || 'unknown.pdf',
                            },
                            pairedItem: itemIndex,
                        });
                        break;
                    case 'code':
                        const userCode = this.getNodeParameter('pdf-code', itemIndex);
                        const runUserCode = new Function('ctx', `
"use strict";
return (async () => {
  const {
    // n8n context helpers
    nodeThis,
    NodeOperationError,

    // current loop context
    items,
    item,
    itemIndex,
    operation,
    binaryPropertyName,

    // pdf context
    pdfDoc,
    fileBytes,
    PDFDocument,

    // node/std utils
    Buffer,
    fs,

    // output accumulator
    returnData,
  } = ctx;

  // Re-expose common n8n methods on the expected 'this'
  const $this = nodeThis;

  // Make them available as 'this' for code that expects it
  // and also as plain variables in scope
  const helpers = $this.helpers;
  const getNode = $this.getNode.bind($this);
  const getNodeParameter = $this.getNodeParameter.bind($this);
  const getInputData = $this.getInputData.bind($this);
  const continueOnFail = $this.continueOnFail.bind($this);

  ${userCode}
})();
`);
                        await runUserCode({
                            nodeThis: this,
                            NodeOperationError: n8n_workflow_1.NodeOperationError,
                            items,
                            item,
                            itemIndex,
                            operation,
                            binaryPropertyName,
                            pdfDoc,
                            fileBytes,
                            PDFDocument: pdf_lib_1.PDFDocument,
                            Buffer: buffer_1.Buffer,
                            fs,
                            returnData,
                        });
                        break;
                    case 'split':
                        const chunkSize = this.getNodeParameter('chunkSize', itemIndex, 1);
                        const totalPages = pdfDoc.getPageCount();
                        const pdfChunks = [];
                        for (let i = 0; i < totalPages; i += chunkSize) {
                            const newPdf = await pdf_lib_1.PDFDocument.create();
                            const end = Math.min(i + chunkSize, totalPages);
                            const copiedPages = await newPdf.copyPages(pdfDoc, Array.from({ length: end - i }, (_, idx) => i + idx));
                            copiedPages.forEach((page) => newPdf.addPage(page));
                            const newPdfBytes = await newPdf.save();
                            pdfChunks.push({
                                data: buffer_1.Buffer.from(newPdfBytes).toString('base64'),
                                pageRange: `${i + 1}-${end}`,
                            });
                        }
                        returnData.push({
                            json: {
                                count: pdfChunks.length,
                                pageRanges: pdfChunks.map((c) => c.pageRange),
                                operation: 'split',
                                originalFileName: item.binary[binaryPropertyName].fileName || 'unknown.pdf',
                            },
                            binary: pdfChunks.reduce((acc, chunk, idx) => {
                                acc[`pdf${idx + 1}`] = {
                                    data: chunk.data,
                                    fileName: `split_${idx + 1}.pdf`,
                                    mimeType: 'application/pdf',
                                };
                                return acc;
                            }, {}),
                            pairedItem: itemIndex,
                        });
                        break;
                }
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: error.message,
                            debugInfo: {
                                ...debugInfo,
                                fileBytes,
                            },
                        },
                        pairedItem: itemIndex,
                    });
                }
                else {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), error, { itemIndex });
                }
            }
        }
        return [returnData];
    }
}
exports.FuturePdfLib = FuturePdfLib;
//# sourceMappingURL=FuturePdfLib.node.js.map