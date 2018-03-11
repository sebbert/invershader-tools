#![allow(unused_imports)]

#[macro_use]
extern crate serde_derive;
extern crate serde;
extern crate serde_json;
extern crate num;

use std::path::Path;
use std::env;
use std::fs;
use std::io;
use std::io::{Read, Write};
use std::fmt;
use std::ops;
use std::borrow::BorrowMut;
use num::Integer;

#[derive(Copy, Clone, Serialize, Deserialize, Debug)]
struct Size {
    pub width: usize,
    pub height: usize,
}

impl Size {
    pub fn new(width: usize, height: usize) -> Size {
        Size { width, height }
    }

    pub fn iter_rect(&self) -> IterRect {
        IterRect::new(*self)
    }
}

struct IterRect {
    x: usize,
    y: usize,
    size: Size,
}

impl IterRect {
    pub fn new(size: Size) -> Self {
        IterRect { x:0, y:0, size }
    }
}

impl Iterator for IterRect {
    type Item = (usize, usize);

    fn next(&mut self) -> Option<Self::Item> {
        let next_value =
            if self.y >= self.size.height {
                None
            } else {
                Some((self.x, self.y))
            };

        self.x += 1;
        if self.x >= self.size.width {
            self.x = 0;
            self.y += 1;
        }

        next_value
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct Map {
    width: usize,
    height: usize,
    cells: Vec<usize>,
}

impl Map {
    pub fn from_json(json: &str) -> serde_json::Result<Map> {
        serde_json::from_str(json)
    }
}

struct PackedMap {
    logical_size: Size,
    pub blocks: Vec<u32>
}

fn div_rounding_up(lhs: usize, rhs: usize) -> usize {
    (lhs - 1) / rhs + 1
}

const BLOCK_BASE_SIZE: usize = 4;
const NIBBLES_PER_BLOCK: usize = BLOCK_BASE_SIZE * BLOCK_BASE_SIZE;

fn packed_size(logical_size: Size) -> Size {
    Size::new(
        div_rounding_up(logical_size.width, 4),
        div_rounding_up(logical_size.height, 4))
}

impl PackedMap {
    pub fn from_map(map: &Map) -> PackedMap {
        let map_size = Size::new(map.width, map.height);
        assert!(map.width.is_multiple_of(&BLOCK_BASE_SIZE));
        assert!(map.height.is_multiple_of(&BLOCK_BASE_SIZE));

        let ps = packed_size(map_size);
        let mut blocks = vec![0u32; ps.width*ps.height];

        let block_size = Size::new(BLOCK_BASE_SIZE, BLOCK_BASE_SIZE);

        for (block_x, block_y) in ps.iter_rect() {
            for (inner_x, inner_y) in block_size.iter_rect() {
                let block_index = (block_y * ps.width) + block_x;
                let inner_index = (inner_y * BLOCK_BASE_SIZE) + inner_x;
                let orig_x = (block_x*BLOCK_BASE_SIZE)+inner_x;
                let orig_y = (block_y*BLOCK_BASE_SIZE)+inner_y;
                let orig_index = (orig_y * map.width) + orig_x;

                blocks[block_index] |= (map.cells[orig_index] as u32) << 2*inner_index;
            }
        }

        PackedMap { logical_size: map_size, blocks }
    }

    pub fn logical_size(&self) -> Size {
        self.logical_size
    }

    pub fn packed_size(&self) -> Size {
        packed_size(self.logical_size)
    }
}

fn write_glsl<W : io::Write>(dst: &mut W, map: PackedMap) -> io::Result<()> {
    let block_size = map.packed_size();
    let logical_size = map.logical_size();

    write!(dst, "
const uvec2 MAP_PACKED_SIZE = uvec2({},{});
const uvec2 MAP_SIZE = uvec2({},{});

uint _MAP[{}];
",
    block_size.width, block_size.height,
    logical_size.width, logical_size.height,
    map.blocks.len()
    )?;

    write!(dst, "
void initMap() {{
    int i=0;
    #define D _MAP[i++]=
")?;
    
    for (index, block) in map.blocks.iter().enumerate() {
        let is_new_row = (index % 6) == 0;
        if is_new_row {
            write!(dst, "\n    ");
        }

        write!(dst, "D {}u;", block)?;
    }

    write!(dst, "

    #undef D
}}

float sampleMap(in vec2 floatPos) {{
    uvec2 logicalPos = uvec2(floatPos);

    // We pack a 4x4 block of tiles in one 32-bit integer
    uvec2 blockPos = logicalPos / 4u;
    uint blockIndex = blockPos.y * MAP_PACKED_SIZE.x + blockPos.x;

    // mod(x, y) = x - y * floor(x/y)
    // floor(x/y) is already computed as blockPos
    uvec2 innerPos = logicalPos - 4u * blockPos;
    uint innerIndex = innerPos.y * 4u + innerPos.x;

    // Grab nibble inside block
    uint state = 3u & (_MAP[blockIndex] >> (innerIndex*2u));

    // Normalize to engine format (wall=0.0, black=0.5, white=1.0)
    return float(state) / 2.;
}}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{{
    initMap();
    fragCoord /= 8.;
    fragColor = vec4(vec3(sampleMap(mod(fragCoord, vec2(MAP_SIZE)))), 1.0);
}}

")?;

    Ok(())
}

fn main() {
    let mut args = env::args();
    if args.len() != 2 {
        panic!("Usage: {} <path_to_map_file>", args.nth(0).unwrap());
    }
    let args_str = args.nth(1).unwrap();
    let path = Path::new(&args_str);
    let json = {
        let mut file = fs::File::open(path).unwrap();
        let mut json = String::new();
        file.read_to_string(&mut json);
        json
    };
    let map = Map::from_json(&json).unwrap();
    write_glsl(&mut io::stdout(), PackedMap::from_map(&map)).unwrap();
}