import Link from "next/link";

export const Navbar = ({}) => {
    return (
        <>
            <header className="shadow-md flex items-center justify-between px-4 py-3 bg-teal-700">
                <div className="flex items-center justify-between px-4 py-3">
                    <div>
                        <Link href="/" className="focus:outline-none">
                            <span className="px-2 text-2xl font-bold tracking-wide text-white">
                                Earnest AI (playground)
                            </span>
                        </Link>
                    </div>
                </div>
                <nav>
                    <div className="px-2 pb-4 pt-2 lg:flex lg:p-0">
                        <a
                            href="/dashboard"
                            className="block rounded px-2 py-1 font-semibold text-gray-100"
                        >
                            Scholarships Search
                        </a>
                        {/* <a
                            href="/borrower/dashboard"
                            className="block rounded px-2 py-1 font-semibold text-gray-100"
                        >
                            Scholarships Search w/ Langchain
                        </a> */}
                    </div>
                </nav>
            </header>
        </>
    );
};
