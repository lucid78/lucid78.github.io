var store = [{
        "title": "pwntools 개발기 (1)",
        "excerpt":"라이브러리로 작성된 완전한 코드는 아래에서 확인 가능하다. https://github.com/lucid78/pwntoolscpp pwntools? pwntools는 CTF에 관심있는 사람이라면 한번쯤은 들어봤을 법한 pwnable을 위한 전용 도구이다. (https://github.com/Gallopsled/pwntools) python으로 제작된 이 도구는 ctf에서 pwnable을 빠르게 진행할 수 있도록 각종 편의 기능을 보유하고 있어 매우 편리하다. 만약 비교적 최근에 pwnable을 시작한 newbie라면 hexray(IDA)와 pwntools 없이는 pwnable이 불가능할 수도...","categories": ["pwntools"],
        "tags": ["dev"],
        "url": "https://lucid78.github.io/pwntools/pwntoolscpp-1/",
        "teaser": null
      },{
        "title": "pwntools 개발기 (2)",
        "excerpt":"라이브러리로 작성된 완전한 코드는 아래에서 확인 가능하다. https://github.com/lucid78/pwntoolscpp recv_until recvuntil() 함수는 이 함수에 전달된 파라미터 문자가 대상의 출력에서 발견될 때까지 읽어들이는 함수이다. C에서라면 read() 함수로 문자를 1바이트씩 읽으면서 delim 문자인지 확인을 하는 꽤 귀찮은 작업을 거쳐야 하지만, boost에서는 boost::asio::read_until이라는 함수가 이 기능을 지원한다. (https://www.boost.org/doc/libs/1_70_0/doc/html/boost_asio/reference/read_until.html) boost::asio::read_until()의 사용법은 아래와 같다. 세번째 파라미터가...","categories": ["pwntools"],
        "tags": ["dev"],
        "url": "https://lucid78.github.io/pwntools/pwntoolscpp-2/",
        "teaser": null
      },{
        "title": "pwntools 개발기 (3)",
        "excerpt":"라이브러리로 작성된 완전한 코드는 아래에서 확인 가능하다. https://github.com/lucid78/pwntoolscpp LAB4 이제 가장 기본적인 기능은 어느정도 완성되었고, lab3에서도 동작하는 것을 확인했으니 이번에는 lab4를 공략해보자. 아래는 https://bachs.tistory.com/entry/HITCON-Training-lab4-return-to-library 에서 발췌한 lab4를 공략하는 exploit이다. from pwn import * p = process('./ret2lib') e = ELF('./ret2lib') #found address of puts got log.info(\"found address of puts got :...","categories": ["pwntools"],
        "tags": ["dev"],
        "url": "https://lucid78.github.io/pwntools/pwntoolscpp-3/",
        "teaser": null
      },{
        "title": "pwntools 개발기 (4)",
        "excerpt":"라이브러리로 작성된 완전한 코드는 아래에서 확인 가능하다. https://github.com/lucid78/pwntoolscpp got 마지막으로 ELF 클래스에 got() 함수를 추가하는 작업만이 남았다. PLT와 GOT에 대한 추가 설명은 아래 링크로 대신한다. PLT와 GOT 자세히 알기 1 앞서 binary에 설정된 stack canary check를 위해 해당 파일의 모든 symbol 정보를 가져오는 get_symbol() 함수를 작성했었다. ELF 클래스의 가장 마지막에...","categories": ["pwntools"],
        "tags": ["dev"],
        "url": "https://lucid78.github.io/pwntools/pwntoolscpp-4/",
        "teaser": null
      },{
        "title": "pwntools 개발기 (5)",
        "excerpt":"라이브러리로 작성된 완전한 코드는 아래에서 확인 가능하다. https://github.com/lucid78/pwntoolscpp got 두 개의 소스를 관리하기가 힘들어서 지금부터는 라이브러리로 작성된 코드를 수정하며 이어가도록 한다. 지난 개발기에서 마지막으로 got() 함수를 추가했다. 사실 이 함수는 타겟 바이너리로부터 수집한 모든 symbol들의 정보를 조회하는 방식이라 got에 포함된 symbol들만을 가지고 있지는 않다. 실제 got의 정보는 .rel.plt section에 포함되어...","categories": ["pwntools"],
        "tags": ["dev"],
        "url": "https://lucid78.github.io/pwntools/pwntoolscpp-5/",
        "teaser": null
      },{
        "title": "linux kernel exploit 분석 - cve-2017-7308",
        "excerpt":"Intro 이 글은 google project zero에서 2007년에 발표한 cve-2017-7308에 관해 분석한 글이다. 이 취약점에 대한 자세한 내용은 해당 취약점의 원문인 Exploiting the Linux kernel via packet sockets 에 잘 설명이 되어 있으므로 반드시 읽어보기를 권한다. 만약 영어에 어려움이 있다면 해당 원문의 많은 부분을 번역해 놓은 CVE-2017-7308 분석 블로그 번역을 보면...","categories": ["linux-kernel-exploits,","CVE-2017-7308"],
        "tags": ["dev"],
        "url": "https://lucid78.github.io/linux-kernel-exploits,/cve-2017-7308/cve-2017-7308/",
        "teaser": null
      }]
