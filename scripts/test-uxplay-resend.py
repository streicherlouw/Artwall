#!/usr/bin/env python3
"""Compile the patched dequeue function and exercise loss/reorder recovery."""
import pathlib,re,subprocess,sys,tempfile
source=(pathlib.Path(sys.argv[1])/'lib/raop_buffer.c').read_text()
function=re.search(r'void \*\s*raop_buffer_dequeue\([^)]*\)\s*\{.*?^\}',source,re.S|re.M).group()
prefix=r'''
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#define RAOP_BUFFER_LENGTH 256
typedef struct {int filled;uint32_t rtp_timestamp;unsigned short seqnum;unsigned int payload_size;void *payload_data;} raop_buffer_entry_t;
typedef struct {int is_empty;unsigned short first_seqnum,last_seqnum;raop_buffer_entry_t entries[256];} raop_buffer_t;
static short seqnum_cmp(unsigned short a,unsigned short b){return (short)(a-b);}
'''
suffix=r'''
static raop_buffer_t b;
static unsigned int length;static uint32_t timestamp;static unsigned short sequence;
static void fill(unsigned short seq){raop_buffer_entry_t *e=&b.entries[seq%256];e->filled=1;e->seqnum=seq;e->payload_data=(void*)1;}
static void setup(unsigned short start,int count){memset(&b,0,sizeof(b));b.first_seqnum=start;b.last_seqnum=start+count-1;for(int i=1;i<count;i++)fill(start+i);}
int main(void){
 setup(100,11);assert(!raop_buffer_dequeue(&b,&length,&timestamp,&sequence,0,12));assert(b.first_seqnum==100);
 /* A timely retransmission preserves original order. */
 fill(100);assert(raop_buffer_dequeue(&b,&length,&timestamp,&sequence,0,12));assert(sequence==100);
 setup(100,12);assert(raop_buffer_dequeue(&b,&length,&timestamp,&sequence,0,12));assert(sequence==101);
 for(int i=102;i<112;i++){assert(raop_buffer_dequeue(&b,&length,&timestamp,&sequence,0,12));assert(sequence==i);}
 assert(!raop_buffer_dequeue(&b,&length,&timestamp,&sequence,0,12));
 /* Multiple missing packets and 16-bit sequence wrap. */
 setup(65534,12);b.entries[65535%256].filled=0;
 assert(raop_buffer_dequeue(&b,&length,&timestamp,&sequence,0,12));assert(sequence==0);
 /* Audio-only retains the original long resend window. */
 setup(100,12);assert(!raop_buffer_dequeue(&b,&length,&timestamp,&sequence,0,256));assert(b.first_seqnum==100);
 setup(100,256);assert(!raop_buffer_dequeue(&b,&length,&timestamp,&sequence,0,256));assert(b.first_seqnum==101);
 setup(100,2);assert(!raop_buffer_dequeue(&b,&length,&timestamp,&sequence,1,12));assert(b.first_seqnum==101);
 return 0;
}
'''
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d);(p/'test.c').write_text(prefix+function+suffix)
 subprocess.run(['cc',str(p/'test.c'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('Mirror resend: reorder, missing runs, backlog drain, sequence wrap and ALAC compatibility passed')
