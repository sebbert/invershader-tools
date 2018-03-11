const Observable = require("FuseJS/Observable");
const fs = require("FuseJS/FileSystem");

const blocksX = Observable(3);
const blocksY = Observable(2);

const scaleTwoWay = (obs, scale) =>
	obs.mapTwoWay(orig => orig * scale, scaled => scaled / scale);

const width = scaleTwoWay(blocksX, 4);
const height = scaleTwoWay(blocksY, 4);

const CELL_STATE_OFF = " ";
const CELL_STATE_BLACK = "#";
const CELL_STATE_WHITE = "x";

const TOOL_BLACK = "black";
const TOOL_WHITE = "white";
const TOOL_WALL  = "wall";
const TOOL_INVERT = "invert";
const TOOL_CYCLE = "cycle";
const TOOL_FILL = "fill";

const currentTool = Observable(TOOL_BLACK);
const currentFillState = Observable(CELL_STATE_BLACK);

const SETTINGS_FILE_NAME = fs.dataDirectory + "/invershader-tools.map-editor.settings.json";

function saveSettings() {
	const settings = {
		exportPath: exportPath.value
	};

	fs.writeTextToFile(SETTINGS_FILE_NAME, JSON.stringify(settings))
	.catch(err => {
		console.error(`Unable to save settings: ${err.stack || err}`);
	});
}

function loadSettings() {
	fs.readTextFromFile(SETTINGS_FILE_NAME)
	.then(file => {
		const settings = JSON.parse(file);
		exportPath.value = settings.exportPath;
	})
	.catch(err => console.error(`Unable to load settings: ${err.stack || err}`));
}

function cycleState(state) {
	switch (state) {
		case CELL_STATE_OFF:   return CELL_STATE_BLACK;
		case CELL_STATE_BLACK: return CELL_STATE_WHITE;
		default:               return CELL_STATE_OFF;
	}
}

function invertState(state) {
	switch (state) {
		case CELL_STATE_BLACK: return CELL_STATE_WHITE;
		case CELL_STATE_WHITE: return CELL_STATE_BLACK;
		default:               return CELL_STATE_OFF;
	}
}

function fill(fromCell) {
	const targetState = fromCell.state.value;
	const replacementState = currentFillState.value;
	
	if (targetState === replacementState)
		return;

	fromCell.state.value = replacementState;

	const queue = [ fromCell.x, fromCell.y ];

	const dequeue = () => [queue.shift(), queue.shift()];
	const enqueue = (x, y) => queue.push(x, y);


	const w = width.value;
	const h = height.value;

	const idx = (x, y) => (y * w) + x;

	const fastCells = new Array(w * h);
	cells.forEach(cell => {
		fastCells[idx(cell.x, cell.y)] = cell.state.value;
	})

	const maxIter = 1000;
	let numIter = 0;

	function visit(x, y) {
		if (x < 0 || x >= width.value ||
			y < 0 || y >= height.value)
			return;
		
		let index = idx(x, y);
		let state = fastCells[index];
		if(state == targetState) {
			fastCells[index] = replacementState;
			enqueue(x, y);
		}
	}

	function iter() {
		let pos = dequeue();
		let [x, y] = pos;
		
		visit(x-1, y  );
		visit(x+1, y  );
		visit(x  , y-1);
		visit(x  , y+1);

		numIter++;
		if (numIter > maxIter) {
			throw new Error(`Flood fill: Exceeded maximum of ${maxIter} iterations`);
		}
	}

	while (queue.length)
		iter();

	let newCells = new Array(w * h);

	fastCells.forEach((state, index) => {
		let x = index % w;
		let y = Math.floor(index / w);
		newCells[index] = new Cell(x, y, state);
	});
	
	
	cells.replaceAll(newCells);
}

function getNextState(state) {
	let tool = currentTool.value;
	switch (tool) {
		case TOOL_BLACK:  return CELL_STATE_BLACK;
		case TOOL_WHITE:  return CELL_STATE_WHITE;
		case TOOL_WALL:   return CELL_STATE_OFF;
		case TOOL_INVERT: return invertState(state);
		case TOOL_CYCLE:  return cycleState(state);
		default: throw new Error("Invalid tool: " + tool);
	}
}

function toggle(cell) {
	let tool = currentTool.value;
	switch (tool) {
		case TOOL_FILL:
			fill(cell);
			break;

		default:
			cell.state.value = getNextState(cell.state.value);
			break;
	}
}

function toggleFillState() {
	currentFillState.value = cycleState(currentFillState.value);
}

class Cell {
	constructor(x, y, state) {
		this.id = `${x},${y}`;
		this.x = x;
		this.y = y;
		this.state = Observable(state);

		this.toggle = () => {
			toggle(this);
		}
	}
}

const cells = Observable();
const widthHeightCallback = () => {};
let widthHeightObservable =
	width.combineLatest(height, (width, height) => {
		// Only init cells once
		widthHeightObservable.removeSubscriber(widthHeightCallback);
		
		for (let y = 0; y < height; ++y) {
			for (let x = 0; x < width; ++x) {
				let state = CELL_STATE_OFF;
				cells.add(new Cell(x, y, state))
			}
		}
	});
widthHeightObservable.addSubscriber(widthHeightCallback);

let oldWidth = width.value;
let oldHeight = height.value;

function addRow() {
	let newCells = new Array(width.value * 4);

	for (let x = 0; x < width.value; ++x)
	for (let i = 0; i < 4; ++i)
		newCells[x*4+i] = new Cell(x, height.value+i, CELL_STATE_OFF);

	cells.addAll(newCells);
	blocksY.value++;
}

function addCol() {
	let newCells = new Array(height.value * 4);

	for (let y = 0; y < height.value; ++y)
	for (let i = 0; i < 4; ++i)
		newCells[y*4+i] = new Cell(width.value+i, y, CELL_STATE_OFF);

	cells.addAll(newCells);
	blocksX.value++;
}

function removeRow() {
	blocksY.value--;
	trimCells();
}

function removeCol() {
	blocksX.value--;
	trimCells();
}

function trimCells() {
	cells.removeWhere(cell =>
		cell.x >= width.value ||
		cell.y >= height.value
	)
}

const resetMap = () => {
	cells.forEach((cell) => {
		cell.state.value = CELL_STATE_OFF;
	})
}

function stateAsInt(state) {
	switch (state) {
		case CELL_STATE_OFF: return 0;
		case CELL_STATE_BLACK: return 1;
		case CELL_STATE_WHITE: return 2;
		default: throw new Error("Invalid state: " + state);
	}
}

const exportPath = Observable("/Users/Sebbert/code/invershader-tools/map-packer/map.json");

function exportMap() {
	if (exportPath.value == null) {
		openExportDialog();
		return;
	}

	let packedCells = new Array(width.value * height.value);2
	cells.forEach(cell => {
		let index = cell.y * width.value + cell.x;
		let intState = stateAsInt(cell.state.value);
		packedCells[index] = intState;
	});

	packedCells.forEach((s, i) => {
		if (s == undefined) {
			packedCells[i] = stateAsInt(CELL_STATE_OFF);
			let x = i % width.value;
			let y = (i - x) / width.value;
			console.warn(`Cell at (${x}, ${y}) was undefined`);
		}
	});

	const json = JSON.stringify({
		width: width.value,
		height: height.value,
		scaleFactor: 1,
		cells: packedCells,
	});

	fs.writeTextToFile(exportPath.value, json)
		.catch(console.error.bind(console));

	closeExportDialog();
	saveSettings();
}

const showExportDialog = Observable(false);

function openExportDialog() {
	showExportDialog.value = true;
}

function closeExportDialog() {
	showExportDialog.value = false;
}

loadSettings();

module.exports = {
	width,
	height,
	cells,
	exportMap,
	resetMap,
	addRow,
	addCol,
	removeRow,
	removeCol,
	currentTool,
	currentFillState,
	toggleFillState,
	showExportDialog,
	openExportDialog,
	closeExportDialog,
	exportPath,
};
