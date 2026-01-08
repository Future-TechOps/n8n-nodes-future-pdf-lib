import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
const { PDFDocument, StandardFonts, rgb, degrees } = require('../../lib/pdf-lib/pdf-lib.min.js');
import { Buffer } from 'buffer';
const fs = require('fs');

void StandardFonts;
void rgb;
void degrees;

// CODE128-B barcode renderer for pdf-lib (no canvas, no jsbarcode)
// Supports ASCII 32–127 (standard Code Set B)

type PdfLibColor = any;

type DrawCode128BOptions = {
	x: number;
	y: number;
	width: number;
	height: number;
	rgb: (r: number, g: number, b: number) => PdfLibColor;
	quietZoneModules?: number;
	color?: PdfLibColor;
};

type DrawCode128BResult = {
	symbolCount: number;
	moduleWidth: number;
	quietZoneModules: number;
};

const CODE128_PATTERNS: string[] = [
	'212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
	'221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
	'221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
	'212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
	'231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
	'231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
	'314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
	'112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
	'111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
	'214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
	'114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

// Start Code B = 104, Stop = 106
function code128BEncode(text: string): number[] {
	// Validate (subset B: ASCII 32–127)
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c < 32 || c > 127) {
			throw new Error(`CODE128-B only supports ASCII 32–127. Bad char at index ${i}.`);
		}
	}

	const codes: number[] = [];
	for (let i = 0; i < text.length; i++) {
		codes.push(text.charCodeAt(i) - 32); // 0..95
	}

	let checksum = 104; // Start B
	for (let i = 0; i < codes.length; i++) {
		checksum += codes[i] * (i + 1);
	}

	checksum = checksum % 103;
	return [104, ...codes, checksum, 106];
}

function code128TotalModules(symbolCodes: number[]): number {
	let total = 0;

	for (let i = 0; i < symbolCodes.length; i++) {
		const code = symbolCodes[i];
		const pattern = CODE128_PATTERNS[code];
		if (!pattern) throw new Error(`Invalid CODE128 pattern index: ${code}`);

		for (let j = 0; j < pattern.length; j++) {
			total += Number(pattern[j]);
		}
	}

	return total;
}

/**
 * Draw CODE128-B barcode on a pdf-lib page using rectangles
 *
 * @param page pdf-lib Page instance
 * @param text string to encode (ASCII 32–127)
 * @param opts positioning + sizing options
 */
function drawCode128B(page: any, text: string, opts: DrawCode128BOptions): DrawCode128BResult {
	const x = Number(opts.x) || 0;
	const y = Number(opts.y) || 0;
	const width = Number(opts.width) || 200;
	const height = Number(opts.height) || 50;

	const quietZoneModules = (opts.quietZoneModules ?? 10);
	const rgbFn = opts.rgb;

	if (typeof rgbFn !== 'function') {
		throw new Error('drawCode128B requires opts.rgb (pdf-lib rgb).');
	}

	const color = opts.color || rgbFn(0, 0, 0);

	const symbols = code128BEncode(text);
	const dataModules = code128TotalModules(symbols);
	const totalModules = dataModules + (quietZoneModules * 2);

	const moduleW = width / totalModules;
	let cursorX = x + (quietZoneModules * moduleW);

	for (let s = 0; s < symbols.length; s++) {
		const pattern = CODE128_PATTERNS[symbols[s]];
		let isBar = true;

		for (let i = 0; i < pattern.length; i++) {
			const w = Number(pattern[i]) * moduleW;

			if (isBar) {
				page.drawRectangle({
					x: cursorX,
					y,
					width: w,
					height,
					color,
					borderWidth: 0,
				});
			}

			cursorX += w;
			isBar = !isBar;
		}
	}

	return {
		symbolCount: symbols.length,
		moduleWidth: moduleW,
		quietZoneModules,
	};
}


export class FuturepdfLib implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PDF-LIB',
		name: 'futurepdfLib',
		icon: 'file:PdfLib.svg',
		group: ['transform'],
		version: 1,
		description: 'Perform operations on PDF files (get info, split)',
		defaults: {
			name: 'PDF-LIB',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			let pdfDoc;
			let fileBytes;
			let debugInfo = {};

			try {
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const binaryPropertyName = this.getNodeParameter(
					'binaryPropertyName',
					itemIndex,
					'data',
				) as string;

				const item = items[itemIndex];

				// Always normalise binary so TS and runtime are consistent
				item.binary = item.binary ?? {};

				// If user explicitly says NOPDF, inject a synthetic binary entry
				// so any code can safely read item.binary[binaryPropertyName].fileName etc
				if (binaryPropertyName === 'NOPDF') {
					item.binary.NOPDF = item.binary.NOPDF ?? {
						fileName: 'unknown.pdf',
						mimeType: 'application/pdf',
						data: '',
					};
				}

				const noInputPdf = binaryPropertyName === 'NOPDF';

				if (!noInputPdf) {
					// Input PDF is expected
					if (!item.binary[binaryPropertyName]) {
						throw new NodeOperationError(
							this.getNode(),
							`No binary data property '${binaryPropertyName}' found on item`,
							{ itemIndex },
						);
					}

					// Get file bytes
					try {
						// Try to get file bytes from filesystem
						const binaryData: any = item.binary[binaryPropertyName];

						if (!binaryData?.directory || !binaryData?.fileName) {
							throw new NodeOperationError(
								this.getNode(),
								`No binary data found in property on item`,
								{ itemIndex },
							);
						}

						const filePath = `${binaryData.directory}/${binaryData.fileName}`;
						fileBytes = fs.readFileSync(filePath);
						pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
					} catch (filesystemError: any) {
						// Try to get file bytes from binary data buffer
						try {
							fileBytes = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
							pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
						} catch (binaryError: any) {
							throw new NodeOperationError(
								this.getNode(),
								`Failed to load PDF from both filesystem and binary data. Filesystem error: ${filesystemError?.message || filesystemError}, Binary error: ${binaryError?.message || binaryError}`,
								{ itemIndex },
							);
						}
					}
				} else {
					// Explicit NOPDF path: create a blank PDF
					fileBytes = undefined;
					pdfDoc = await PDFDocument.create();
				}

				switch (operation) {
					case 'noOp':
						drawCode128B(1, 'ABC-123456', {
							x: 50,
							y: 50,
							width: 300,
							height: 80,
							rgb, // comes from ctx
						});
					case 'getInfo':
						// Get PDF Info operation
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
						const userCode = this.getNodeParameter('pdf-code', itemIndex) as string;

						const runUserCode = new Function(
							'ctx',
							`
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
`,
						) as (ctx: any) => Promise<void>;

						await runUserCode({
							nodeThis: this,
							NodeOperationError,

							items,
							item,
							itemIndex,
							operation,
							binaryPropertyName,

							pdfDoc,
							fileBytes,
							PDFDocument,

							Buffer,
							fs,

							returnData,
						});

						break;
					case 'split':
						// Split PDF operation
						const chunkSize = this.getNodeParameter('chunkSize', itemIndex, 1) as number;
						const totalPages = pdfDoc.getPageCount();
						const pdfChunks: { data: string; pageRange: string }[] = [];

						for (let i = 0; i < totalPages; i += chunkSize) {
							const newPdf = await PDFDocument.create();
							const end = Math.min(i + chunkSize, totalPages);
							const copiedPages = await newPdf.copyPages(
								pdfDoc,
								Array.from({ length: end - i }, (_, idx) => i + idx),
							);
							copiedPages.forEach((page: any) => newPdf.addPage(page));
							const newPdfBytes = await newPdf.save();
							pdfChunks.push({
								data: Buffer.from(newPdfBytes).toString('base64'),
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
							binary: pdfChunks.reduce(
								(acc, chunk, idx) => {
									acc[`pdf${idx + 1}`] = {
										data: chunk.data,
										fileName: `split_${idx + 1}.pdf`,
										mimeType: 'application/pdf',
									};
									return acc;
								},
								{} as Record<string, { data: string; fileName: string; mimeType: string }>,
							),
							pairedItem: itemIndex,
						});
						break;
				}
			} catch (error) {
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
				} else {
					throw new NodeOperationError(this.getNode(), error, { itemIndex });
				}
			}
		}
		return [returnData];
	}
}
